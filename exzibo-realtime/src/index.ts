import { DurableObject } from "cloudflare:workers";

export interface Env {
	MY_DURABLE_OBJECT: DurableObjectNamespace<MyDurableObject>;
	PUBLISH_SECRET: string;
	REALTIME_TICKET_SECRET: string;
}

type Role = "staff" | "customer";

type SocketMeta = {
	restaurantId: string;
	role: Role;
	orderId?: string;
	connectedAt: number;
	userId: string;
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

interface TicketPayload {
	sub: string; // userId
	rid: string; // restaurantId
	role: Role;  // staff | customer
	exp: number; // expiry timestamp (ms)
	tid: string; // random ticket id
	aud: "staff" | "customer"; // audience
	oid?: string; // orderId (customer only)
}

/**
 * Verify a signed realtime ticket.
 * Uses HMAC-SHA256 with timing-safe comparison.
 */
async function verifyTicket(
	ticket: string,
	secret: string
): Promise<{ ok: true; payload: TicketPayload } | { ok: false; reason: string }> {
	if (!ticket) {
		return { ok: false, reason: "Missing ticket" };
	}

	const parts = ticket.split(".");
	if (parts.length !== 2) {
		return { ok: false, reason: "Malformed ticket" };
	}

	const [payloadB64, sigB64] = parts;

	let payloadStr: string;
	try {
		payloadStr = atob(payloadB64);
	} catch {
		return { ok: false, reason: "Invalid ticket encoding" };
	}

	let payload: TicketPayload;
	try {
		payload = JSON.parse(payloadStr) as TicketPayload;
	} catch {
		return { ok: false, reason: "Invalid ticket payload" };
	}

	// Verify expiry
	if (!payload.exp || payload.exp < Date.now()) {
		return { ok: false, reason: "Ticket expired" };
	}

	// Verify required fields
	if (!payload.sub || !payload.rid || !payload.role || !payload.tid || !payload.aud) {
		return { ok: false, reason: "Incomplete ticket" };
	}

	if (payload.role !== "staff" && payload.role !== "customer") {
		return { ok: false, reason: "Invalid ticket role" };
	}

	if (payload.aud !== "staff" && payload.aud !== "customer") {
		return { ok: false, reason: "Invalid ticket audience" };
	}

	// Verify HMAC signature using Web Crypto API (timing-safe)
	try {
		const enc = new TextEncoder();
		const keyData = enc.encode(secret);
		const payloadData = enc.encode(payloadStr);
		const sigData = hexToBytes(sigB64);

		const key = await crypto.subtle.importKey(
			"raw",
			keyData,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);

		const expectedSig = await crypto.subtle.sign("HMAC", key, payloadData);
		const expectedHex = bytesToHex(new Uint8Array(expectedSig));

		if (sigB64.length !== expectedHex.length) {
			return { ok: false, reason: "Invalid ticket signature" };
		}

		// Timing-safe comparison
		const sigBuf = new Uint8Array(hexToBytes(sigB64));
		const expectedBuf = new Uint8Array(expectedSig);
		if (!timingSafeEqual(sigBuf, expectedBuf)) {
			return { ok: false, reason: "Invalid ticket signature" };
		}
	} catch {
		return { ok: false, reason: "Ticket verification failed" };
	}

	return { ok: true, payload };
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) return false;
	let result = 0;
	for (let i = 0; i < a.byteLength; i++) {
		result |= a[i]! ^ b[i]!;
	}
	return result === 0;
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
	}
	return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

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

			const ticketParam = url.searchParams.get("ticket");

			if (!ticketParam) {
				return new Response("Missing ticket", { status: 401 });
			}

			const verification = await verifyTicket(ticketParam, this.env.REALTIME_TICKET_SECRET);
			if (!verification.ok) {
				return new Response(verification.reason, { status: 401 });
			}

			const { payload } = verification;

			// Enforce audience match — staff ticket can only connect as staff
			if (payload.aud !== payload.role) {
				return new Response("Audience mismatch", { status: 403 });
			}

			const pair = new WebSocketPair();
			const [client, server] = Object.values(pair);

			// This enables WebSocket Hibernation.
			// Do not use server.accept().
			this.ctx.acceptWebSocket(server);

			const meta: SocketMeta = {
				restaurantId: payload.rid,
				role: payload.role,
				orderId: payload.oid,
				connectedAt: Date.now(),
				userId: payload.sub,
			};

			server.serializeAttachment(meta);

			server.send(
				JSON.stringify({
					type: "CONNECTED",
					restaurantId: payload.rid,
					role: payload.role,
					orderId: payload.oid,
					userId: payload.sub,
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
		// /ws/restaurant/res_123?ticket=<signed_ticket>
		if (url.pathname.startsWith("/ws/restaurant/")) {
			const restaurantId = url.pathname.split("/").pop();

			if (!restaurantId) {
				return new Response("Missing restaurantId", { status: 400 });
			}

			const ticket = url.searchParams.get("ticket");

			if (!ticket) {
				return new Response("Missing ticket", { status: 401 });
			}

			// Verify the ticket at the Worker level before forwarding to DO
			const verification = await verifyTicket(ticket, env.REALTIME_TICKET_SECRET);
			if (!verification.ok) {
				return new Response(verification.reason, { status: 401 });
			}

			// Verify the ticket's restaurant scope matches the requested restaurant
			if (verification.payload.rid !== restaurantId) {
				return new Response("Restaurant scope mismatch", { status: 403 });
			}

			const durableObjectId = env.MY_DURABLE_OBJECT.idFromName(
				`restaurant:${restaurantId}`
			);

			const room = env.MY_DURABLE_OBJECT.get(durableObjectId);

			const connectUrl = new URL("https://durable-object/connect");
			connectUrl.searchParams.set("ticket", ticket);

			return room.fetch(new Request(connectUrl.toString(), request));
		}

		// Publish route:
		// Backend calls this after Neon commit
		// Authentication is MANDATORY — fail closed.
		if (url.pathname === "/publish/order-event" && request.method === "POST") {
			// Fail closed if PUBLISH_SECRET is not configured
			if (!env.PUBLISH_SECRET) {
				console.error("[realtime] PUBLISH_SECRET not configured — publish rejected");
				return new Response("Server configuration error: PUBLISH_SECRET not set", { status: 500 });
			}

			const authHeader = request.headers.get("Authorization");

			if (!authHeader) {
				return new Response("Missing Authorization header", { status: 401 });
			}

			if (!authHeader.startsWith("Bearer ")) {
				return new Response("Invalid Authorization header format", { status: 401 });
			}

			const token = authHeader.slice("Bearer ".length);

			// Timing-safe comparison for publish secret
			const enc = new TextEncoder();
			const tokenBuf = enc.encode(token);
			const secretBuf = enc.encode(env.PUBLISH_SECRET);

			if (!timingSafeEqual(tokenBuf, secretBuf)) {
				return new Response("Unauthorized", { status: 401 });
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
