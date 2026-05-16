import Script from 'next/script'

/**
 * Conversion-tracking pixels mounted in the root layout. Each pixel
 * is gated on a public env var; when the var is unset the script is
 * not rendered at all — zero-cost no-op for local dev / preview
 * deploys / pre-launch.
 *
 * Why next/script:
 *   - strategy="afterInteractive" defers loading until the page is
 *     hydrated, so pixels never block first paint.
 *   - dangerouslySetInnerHTML in the bootstrap snippet is the
 *     vendor-recommended pattern for both Meta and GA4. The
 *     snippets are static and trusted.
 *
 * Conversion events are NOT fired here. Page-load events fire
 * automatically (Meta's PageView, GA4's page_view). Custom
 * conversion events for "trial signup completed" are dispatched
 * server-side from verifySignupOtp via the Conversions API in a
 * follow-up — server-side is more accurate (no ad blockers, no
 * cookie consent issues) and the schema for that lives on Meta's
 * side.
 *
 * Env vars (set in Vercel project settings):
 *   - NEXT_PUBLIC_META_PIXEL_ID       — 15-digit numeric pixel id
 *   - NEXT_PUBLIC_GA4_MEASUREMENT_ID  — "G-XXXXXXXXXX" measurement id
 */
export function TrackingScripts() {
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  const ga4Id = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID

  return (
    <>
      {metaPixelId ? <MetaPixel pixelId={metaPixelId} /> : null}
      {ga4Id ? <GA4 measurementId={ga4Id} /> : null}
    </>
  )
}

function MetaPixel({ pixelId }: { pixelId: string }) {
  // Vendor bootstrap snippet, lightly reformatted. The PageView
  // event fires automatically on every page load; route changes
  // inside the SPA are tracked via the Next router (covered by
  // GA4's automatic event collection — Meta is page-load only,
  // which matches our case since marketing pages are server-rendered
  // navigations rather than client-side route changes).
  return (
    <>
      <Script
        id="meta-pixel-bootstrap"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
          `.trim(),
        }}
      />
      {/* Noscript fallback so server-side pageview is captured even
          when the user has JS disabled. Ad blockers typically block
          this too, but it's the documented best-practice tag. */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  )
}

function GA4({ measurementId }: { measurementId: string }) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script
        id="ga4-bootstrap"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}');
          `.trim(),
        }}
      />
    </>
  )
}
