import { DurableObject } from "cloudflare:workers";

export interface Env {
	MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObject>;
	PUBLISH_SECRET?: string;
}

type Role = "staff" | "customer";

type SocketMeta = {
	restaurantId: string;
	role: Role;
	orderId?: string;
	connectedAt: number;
};

type OrderEvent = {
	type: "ORDER_CREATED" | "ORDER_STATUS_CHANGED" | "ORDER_CANCELLED";
	restaurantId: string;
	orderId: string;
	status?: string;
	version: number;
	eventId: string;
	time: string;
};

export class MyDurableObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// WebSocket connection inside Durable Object
		if (url.pathname === "/connect") {
			const upgradeHeader = request.headers.get("Upgrade");

			if (upgradeHeader !== "websocket") {
				return new Response("Expected WebSocket", { status: 426 });
			}

			const restaurantId = url.searchParams.get("restaurantId");
			const role = url.searchParams.get("role") as Role | null;
			const orderId = url.searchParams.get("orderId") || undefined;

			if (!restaurantId || !role) {
				return new Response("Missing restaurantId or role", { status: 400 });
			}

			if (role !== "staff" && role !== "customer") {
				return new Response("Invalid role", { status: 400 });
			}

			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);

			// This enables WebSocket Hibernation.
			// Do not use server.accept().
			this.ctx.acceptWebSocket(server);

			const meta: SocketMeta = {
				restaurantId,
				role,
				orderId,
				connectedAt: Date.now(),
			};

			server.serializeAttachment(meta);

			server.send(
				JSON.stringify({
					type: "CONNECTED",
					restaurantId,
					role,
					orderId,
					time: new Date().toISOString(),
				})
			);

			return new Response(null, {
				status: 101,
				webSocket: client,
			});
		}

		// Publish order event to connected clients
		if (url.pathname === "/publish" && request.method === "POST") {
			const event = (await request.json()) as OrderEvent;

			if (!event.restaurantId || !event.orderId || !event.eventId) {
				return new Response("Invalid event payload", { status: 400 });
			}

			let sent = 0;

			for (const ws of this.ctx.getWebSockets()) {
				const meta = ws.deserializeAttachment() as SocketMeta | null;

				if (!meta) continue;

				// Staff receives all events for this restaurant
				if (meta.role === "staff" && meta.restaurantId === event.restaurantId) {
					ws.send(JSON.stringify(event));
					sent++;
					continue;
				}

				// Customer receives only their own order event
				if (
					meta.role === "customer" &&
					meta.restaurantId === event.restaurantId &&
					meta.orderId === event.orderId
				) {
					ws.send(JSON.stringify(event));
					sent++;
				}
			}

			return Response.json({
				ok: true,
				sent,
				eventId: event.eventId,
			});
		}

		return new Response("Durable Object route not found", { status: 404 });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		if (typeof message !== "string") return;

		try {
			const data = JSON.parse(message);

			if (data.type === "PING") {
				ws.send(
					JSON.stringify({
						type: "PONG",
						time: Date.now(),
					})
				);
			}
		} catch {
			ws.send(
				JSON.stringify({
					type: "ERROR",
					message: "Invalid WebSocket message",
				})
			);
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		ws.close(code, reason);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Health check
		if (url.pathname === "/health") {
			return Response.json({
				ok: true,
				service: "exzibo-realtime",
				time: new Date().toISOString(),
			});
		}

		// WebSocket route:
		// /ws/restaurant/res_123?role=customer&orderId=ord_123
		// /ws/restaurant/res_123?role=staff
		if (url.pathname.startsWith("/ws/restaurant/")) {
			const restaurantId = url.pathname.split("/").pop();

			if (!restaurantId) {
				return new Response("Missing restaurantId", { status: 400 });
			}

			const role = url.searchParams.get("role") || "customer";
			const orderId = url.searchParams.get("orderId");

			const durableObjectId = env.MY_DURABLE_OBJECT.idFromName(
				`restaurant:${restaurantId}`
			);

			const room = env.MY_DURABLE_OBJECT.get(durableObjectId);

			const connectUrl = new URL("https://durable-object/connect");
			connectUrl.searchParams.set("restaurantId", restaurantId);
			connectUrl.searchParams.set("role", role);

			if (orderId) {
				connectUrl.searchParams.set("orderId", orderId);
			}

			return room.fetch(new Request(connectUrl.toString(), request));
		}

		// Publish route:
		// Backend calls this after Neon commit
		if (url.pathname === "/publish/order-event" && request.method === "POST") {
			// Production will use PUBLISH_SECRET.
			// Local dev can work without it.
			if (env.PUBLISH_SECRET) {
				const authHeader = request.headers.get("Authorization");

				if (authHeader !== `Bearer ${env.PUBLISH_SECRET}`) {
					return new Response("Unauthorized", { status: 401 });
				}
			}

			const event = (await request.json()) as OrderEvent;

			if (!event.restaurantId || !event.orderId || !event.eventId) {
				return new Response("Invalid event payload", { status: 400 });
			}

			const durableObjectId = env.MY_DURABLE_OBJECT.idFromName(
				`restaurant:${event.restaurantId}`
			);

			const room = env.MY_DURABLE_OBJECT.get(durableObjectId);

			return room.fetch("https://durable-object/publish", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(event),
			});
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
