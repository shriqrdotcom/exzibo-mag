import React from 'react'
import ourStoryPlaceholder from '/our-story-placeholder.png'

/**
 * OurStorySection — Premium split-screen "Our Story" UI
 *
 * Props:
 *   label        {string}  — small top label (e.g. restaurant name)
 *   heading      {string}  — main serif heading
 *   body         {string[]}— array of paragraph strings
 *   websiteUrl   {string}  — shown in the bottom footer bar
 *   pageLabel    {string}  — page number / label shown bottom-right
 *   imageSrc     {string}  — right-column image URL (null = placeholder)
 *   imageAlt     {string}  — alt text for the image
 */
export default function OurStorySection({
  label      = 'Exzibo & Co.',
  heading    = 'Welcome to\nOur Restaurant.',
  body       = [
    'Step into a world of elegance where every detail is crafted to delight your senses. Our fine dining restaurant offers a sophisticated ambiance, exquisite cuisine, and warm hospitality that make every visit unforgettable. Whether you\'re here for an intimate dinner or a special celebration, we\'re dedicated to creating a truly exceptional experience for you.',
    'From the first sip of wine to the final bite of dessert, every detail is thoughtfully curated to delight your senses. Whether you\'re celebrating a milestone, enjoying a romantic evening, or simply seeking an extraordinary meal, our team is devoted to creating memories you\'ll cherish. Here, impeccable service, world-class cuisine, and a serene ambiance come together to make every visit truly unforgettable.',
  ],
  websiteUrl = 'www.exzibo.com',
  pageLabel  = 'Page 02',
  imageSrc   = null,
  imageAlt   = 'Our restaurant kitchen',
}) {
  const resolvedImage = imageSrc || ourStoryPlaceholder

  const headingLines = heading.split('\n')

  return (
    <section className="w-full bg-black min-h-screen flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-8 md:px-16 py-4 border-b border-white/5">
        <span className="text-xs tracking-widest uppercase text-gray-500 font-sans">
          {websiteUrl}
        </span>
        <span className="w-8 h-px bg-[#E07A5F]" />
        <span className="text-xs tracking-widest uppercase text-gray-500 font-sans">
          Page 09
        </span>
      </div>

      {/* ── Main split grid ─────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2">

        {/* LEFT — Text content */}
        <div className="flex flex-col justify-between p-12 md:p-24">
          <div>
            {/* Label */}
            <p className="text-xs tracking-widest uppercase text-gray-500 font-sans mb-10 md:mb-16">
              {label}
            </p>

            {/* Heading */}
            <h2
              className="text-5xl md:text-6xl font-serif text-white leading-tight mb-10 md:mb-12"
              style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 500 }}
            >
              {headingLines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < headingLines.length - 1 && <br />}
                </span>
              ))}
            </h2>

            {/* Body paragraphs */}
            <div className="space-y-5 max-w-sm">
              {body.map((para, i) => (
                <p
                  key={i}
                  className="text-sm text-gray-400 leading-relaxed font-sans"
                  style={{ textAlign: 'justify' }}
                >
                  {para}
                </p>
              ))}
            </div>
          </div>

          {/* Bottom footer bar */}
          <div className="mt-14">
            <div className="flex items-center gap-4 pt-4">
              <span className="text-xs tracking-widest uppercase text-gray-600 font-sans">
                {websiteUrl}
              </span>
              <span className="flex-1 h-px bg-[#E07A5F] opacity-70" />
              <span className="text-xs tracking-widest uppercase text-gray-600 font-sans">
                {pageLabel}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT — Image panel */}
        <div className="relative min-h-[400px] md:min-h-0">
          {/* Image */}
          <img
            src={resolvedImage}
            alt={imageAlt}
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Terracotta accent block — overlaps right edge */}
          <div className="absolute right-0 top-1/4 flex flex-col gap-2 translate-x-2">
            <div
              className="w-7 md:w-9"
              style={{ height: '90px', background: '#E07A5F', opacity: 0.9 }}
            />
            <div
              className="w-5 md:w-7"
              style={{ height: '55px', background: '#C4634A', opacity: 0.75 }}
            />
          </div>

          {/* Subtle dark gradient on the left edge to blend with text column */}
          <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-black/30 to-transparent pointer-events-none" />
        </div>
      </div>
    </section>
  )
}
