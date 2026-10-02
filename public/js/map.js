(() => {
    'use strict'

    if (!window.L) return

    const createMap = (element, coordinates) => {
        const map = L.map(element, { scrollWheelZoom: false }).setView(coordinates, coordinates ? 13 : 2)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map)
        return map
    }

    const listingMap = document.getElementById('listingMap')
    if (listingMap) {
        const lat = Number(listingMap.dataset.latitude)
        const lng = Number(listingMap.dataset.longitude)
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const map = createMap(listingMap, [lat, lng])
            L.marker([lat, lng]).addTo(map).bindPopup(listingMap.dataset.title || 'Wanderlust stay').openPopup()
            map.scrollWheelZoom.enable()
        }
    }

    const picker = document.getElementById('coordinatePicker')
    if (!picker) return

    const latitude = document.getElementById('latitude')
    const longitude = document.getElementById('longitude')
    if (!latitude || !longitude) return

    const initialLat = Number(picker.dataset.latitude)
    const initialLng = Number(picker.dataset.longitude)
    const initialCoordinates = Number.isFinite(initialLat) && Number.isFinite(initialLng)
        ? [initialLat, initialLng]
        : null
    const map = createMap(picker, initialCoordinates)
    let marker = initialCoordinates ? L.marker(initialCoordinates).addTo(map) : null

    const setCoordinates = (lat, lng) => {
        latitude.value = lat.toFixed(6)
        longitude.value = lng.toFixed(6)
        const point = [lat, lng]
        if (marker) marker.setLatLng(point)
        else marker = L.marker(point).addTo(map)
        map.setView(point, Math.max(map.getZoom(), 13))
    }

    map.on('click', (event) => setCoordinates(event.latlng.lat, event.latlng.lng))
    for (const input of [latitude, longitude]) {
        input.addEventListener('change', () => {
            const lat = Number(latitude.value)
            const lng = Number(longitude.value)
            if (latitude.value && longitude.value && Number.isFinite(lat) && Number.isFinite(lng)) {
                const point = [lat, lng]
                if (marker) marker.setLatLng(point)
                else marker = L.marker(point).addTo(map)
                map.setView(point, Math.max(map.getZoom(), 13))
            } else if (!latitude.value && !longitude.value && marker) {
                map.removeLayer(marker)
                marker = null
            }
        })
    }

    const locationButton = document.querySelector('[data-use-location]')
    locationButton?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            window.alert('Location access is not available in this browser.')
            return
        }
        locationButton.disabled = true
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
                setCoordinates(coords.latitude, coords.longitude)
                locationButton.disabled = false
            },
            () => {
                locationButton.disabled = false
                window.alert('We could not access your location. You can still select a point on the map.')
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        )
    })

    window.setTimeout(() => map.invalidateSize(), 100)
})()
