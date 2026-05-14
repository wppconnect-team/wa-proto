;(() => {
    const urls = new Set()
    const allowedHost = 'static.whatsapp.net'
    const jsFileRegex = /\.m?js(?:[?#]|$)/i
    const jsInTextRegex =
        /(?:https?:)?\/\/[^\s"'`<>]+?\.m?js(?:[?#][^\s"'`<>]*)?|(?:\/|\.\/|\.\.\/)[^\s"'`<>]+?\.m?js(?:[?#][^\s"'`<>]*)?/gi

    function addUrl(rawUrl) {
        if (typeof rawUrl !== 'string') return

        const cleanedUrl = rawUrl.trim().replace(/\\\//g, '/')
        if (!cleanedUrl || !jsFileRegex.test(cleanedUrl)) return

        try {
            let normalizedUrl = cleanedUrl

            if (
                /^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]|$)/i.test(normalizedUrl) &&
                !/^[a-z][a-z0-9+.-]*:/i.test(normalizedUrl)
            ) {
                normalizedUrl = `https://${normalizedUrl}`
            }

            const parsed = new URL(normalizedUrl, location.href)
            if (parsed.hostname.toLowerCase() !== allowedHost) return

            urls.add(parsed.href)
        } catch {}
    }

    function extractJsFromText(text) {
        if (typeof text !== 'string' || !text) return

        const matches = text.match(jsInTextRegex)
        if (!matches) return

        matches.forEach(addUrl)
    }

    function walk(obj, seen = new WeakSet()) {
        if (!obj || typeof obj !== 'object') return
        if (seen.has(obj)) return
        seen.add(obj)

        if (obj.rsrcMap && typeof obj.rsrcMap === 'object') {
            Object.values(obj.rsrcMap).forEach((r) => {
                if (!r || typeof r !== 'object') return
                if (r.type === 'js') {
                    addUrl(r.src || r.url || r.href || r.uri)
                }
            })
        }

        Object.values(obj).forEach((value) => {
            if (typeof value === 'string') {
                addUrl(value)
                return
            }

            walk(value, seen)
        })
    }

    document.querySelectorAll('script[data-sjs]').forEach((script) => {
        extractJsFromText(script.textContent || '')

        try {
            walk(JSON.parse(script.textContent || ''))
        } catch (e) {
            console.warn('Failed to parse script[data-sjs]:', e)
        }
    })

    document.querySelectorAll('script[src]').forEach((script) => {
        addUrl(script.src || script.getAttribute('src'))
    })

    document
        .querySelectorAll(
            'link[rel="preload"][as="script"][href], link[rel="modulepreload"][href], link[rel="prefetch"][as="script"][href], link[rel="prefetch"][href]'
        )
        .forEach((link) => {
            addUrl(link.href || link.getAttribute('href'))
        })

    document.querySelectorAll('script:not([src])').forEach((script) => {
        extractJsFromText(script.textContent || '')
    })

    if (typeof performance?.getEntriesByType === 'function') {
        performance.getEntriesByType('resource').forEach((entry) => {
            if (entry && typeof entry.name === 'string') {
                addUrl(entry.name)
            }
        })
    }

    return Array.from(urls)
})()
