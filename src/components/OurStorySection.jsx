import React from 'react'
import ourStoryPlaceholder from '/our-story-placeholder.png'

/**
 * OurStorySection — always side-by-side: text left, image right
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
  body     = [],
  imageSrc = null,
  imageAlt = 'Our restaurant',
}) {
  const resolvedImage = imageSrc || ourStoryPlaceholder
  const headingLines  = heading.split('\n')

  return (
    <section style={{
      width: '100%',
      background: '#000',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      minHeight: '280px',
      maxHeight: '420px',
    }}>

      {/* LEFT — Text */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 'clamp(20px, 5vw, 48px)',
        overflow: 'hidden',
      }}>
        <p style={{
          fontSize: 'clamp(8px, 1.2vw, 11px)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#6b7280',
          marginBottom: 'clamp(8px, 1.5vw, 16px)',
          fontFamily: "'Inter', sans-serif",
        }}>
          {label}
        </p>

        <h2 style={{
          fontFamily: '"Playfair Display", Georgia, serif',
          fontWeight: 500,
          fontSize: 'clamp(18px, 3.5vw, 42px)',
          color: '#fff',
          lineHeight: 1.2,
          marginBottom: 'clamp(8px, 1.5vw, 16px)',
        }}>
          {headingLines.map((line, i) => (
            <span key={i}>
              {line}
              {i < headingLines.length - 1 && <br />}
            </span>
          ))}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '380px' }}>
          {body.map((para, i) => (
            <p
              key={i}
              style={{
                fontSize: 'clamp(10px, 1.4vw, 13px)',
                color: '#9ca3af',
                lineHeight: 1.6,
                textAlign: 'justify',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {para}
            </p>
          ))}
        </div>

        <div style={{
          marginTop: 'clamp(10px, 2vw, 24px)',
          width: '48px',
          height: '2px',
          background: '#E07A5F',
        }} />
      </div>

      {/* RIGHT — Image */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <img
          src={resolvedImage}
          alt={imageAlt}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </div>

    </section>
  )
}
