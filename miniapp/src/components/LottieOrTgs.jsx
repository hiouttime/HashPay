import React, { useEffect, useRef } from 'react'
import lottie from 'lottie-web/build/player/lottie_light'
import pako from 'pako'

function LottieOrTgs({ animationData, src, className, loop = true, autoplay = true }) {
  const containerRef = useRef(null)

  useEffect(() => {
    let disposed = false
    let instance = null

    const run = async () => {
      let data = animationData
      if (!data && src) {
        const res = await fetch(src)
        if (!res.ok) {
          throw new Error(`load animation failed: ${res.status}`)
        }

        if (src.endsWith('.tgs')) {
          const compressed = new Uint8Array(await res.arrayBuffer())
          const jsonText = pako.inflate(compressed, { to: 'string' })
          data = JSON.parse(jsonText)
        } else {
          data = await res.json()
        }
      }

      if (!data || !containerRef.current || disposed) {
        throw new Error('animation source unavailable')
      }

      instance = lottie.loadAnimation({
        container: containerRef.current,
        renderer: 'svg',
        loop,
        autoplay,
        animationData: data,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
        },
      })
    }

    run().catch((err) => {
      if (!disposed) {
        console.error('load lottie/tgs failed:', err)
      }
    })

    return () => {
      disposed = true
      if (instance) {
        instance.destroy()
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [animationData, autoplay, loop, src])

  return <div ref={containerRef} className={className} />
}

export default LottieOrTgs
