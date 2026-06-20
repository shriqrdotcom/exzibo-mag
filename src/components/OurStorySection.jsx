import React from 'react'
import ourStoryPlaceholder from '/our-story-placeholder.png'

/**
 * OurStorySection — Clean two-panel "Our Story" layout
 *
 * Props:
 *   label      {string}    — small top label (restaurant name)
 *   heading    {string}    — main serif heading (use \n for line breaks)
 *   body       {string[]}  — array of paragraph strings
 *   imageSrc   {string}    — right-column image URL (null = placeholder)
 *   imageAlt   {string}    — alt text for the image
 */
export default function OurStorySection({
  label    = 'Our Restaurant',
  heading  = 'Welcome to\nOur Restaurant.',
  body     = [
    'Step into a world of elegance where every detail is crafted to delight your senses. Our fine dining restaurant offers a sophisticated ambiance, exquisite cuisine, and warm hospitality that make every visit unforgettable.',
    'From the first sip of wine to the final bite of dessert, every detail is thoughtfully curated to delight your senses. Impeccable service, world-class cuisine, and a serene ambiance come together to make every visit truly unforgettable.',
  ],
  imageSrc = null,
  imageAlt = 'Our restaurant',
}) {
  const resolvedImage = imageSrc || ourStoryPlaceholder
  const headingLines  = heading.split('\n')

  return (
    <section className="w-full bg-black grid grid-cols-1 md:grid-cols-2">

      {/* LEFT — Text */}
      <div className="flex flex-col justify-center px-10 py-14 md:px-16 md:py-20">
        <p className="text-xs tracking-widest uppercase text-gray-500 mb-8">
          {label}
        </p>

        <h2
          className="text-4xl md:text-5xl text-white leading-snug mb-8"
          style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 500 }}
        >
          {headingLines.map((line, i) => (
            <span key={i}>
              {line}
              {i < headingLines.length - 1 && <br />}
            </span>
          ))}
        </h2>

        <div className="space-y-4 max-w-xs">
          {body.map((para, i) => (
            <p
              key={i}
              className="text-sm text-gray-400 leading-relaxed"
              style={{ textAlign: 'justify' }}
            >
              {para}
            </p>
          ))}
        </div>

        <div className="mt-10 w-12 h-0.5 bg-[#E07A5F]" />
      </div>

      {/* RIGHT — Image */}
      <div className="relative min-h-[300px] md:min-h-[480px]">
        <img
          src={resolvedImage}
          alt={imageAlt}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

    </section>
  )
}
