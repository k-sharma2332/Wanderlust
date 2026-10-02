// Example starter JavaScript for disabling form submissions if there are invalid fields
(() => {
    'use strict'

    document.querySelectorAll('.needs-validation').forEach(form => {
      form.addEventListener('submit', event => {
        if (!form.checkValidity()) {
          event.preventDefault()
          event.stopPropagation()
          form.reportValidity()
          return
        }

        form.classList.add('was-validated')
      }, false)
    })

    document.querySelectorAll('form[data-loading-label]').forEach(form => {
      form.addEventListener('submit', () => {
        if (!form.checkValidity()) return

        const button = form.querySelector('button[type="submit"]')
        if (!button || button.disabled) return

        button.dataset.originalLabel = button.innerHTML
        button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span>${form.dataset.loadingLabel}`
        button.disabled = true
        button.setAttribute('aria-busy', 'true')
      })
    })

    document.querySelectorAll('.booking-form').forEach(form => {
      const checkIn = form.querySelector('#checkIn')
      const checkOut = form.querySelector('#checkOut')
      const total = document.getElementById('estimatedTotal')
      const nightsLabel = document.getElementById('estimatedNights')
      const price = Number(form.dataset.price)
      const originalCheckoutMin = checkOut?.min || ''
      if (!checkIn || !checkOut || !total || !nightsLabel || !Number.isFinite(price)) return

      const updateEstimate = () => {
        if (!checkIn.value || !checkOut.value) {
          total.textContent = 'Choose dates'
          nightsLabel.textContent = 'No payment is collected now.'
          return
        }
        const start = Date.parse(`${checkIn.value}T00:00:00Z`)
        const end = Date.parse(`${checkOut.value}T00:00:00Z`)
        const nights = Math.round((end - start) / 86400000)
        if (!Number.isFinite(nights) || nights < 1) {
          total.textContent = 'Choose valid dates'
          nightsLabel.textContent = 'Check-out must be after check-in.'
          return
        }
        total.textContent = `₹${(price * nights).toLocaleString('en-IN')}`
        nightsLabel.textContent = `${nights} ${nights === 1 ? 'night' : 'nights'} · No payment is collected now.`
      }

      checkIn.addEventListener('change', () => {
        if (checkIn.value) {
          const nextDay = new Date(Date.parse(`${checkIn.value}T00:00:00Z`) + 86400000)
          checkOut.min = nextDay.toISOString().slice(0, 10)
          if (checkOut.value && checkOut.value <= checkIn.value) checkOut.value = ''
        } else checkOut.min = originalCheckoutMin
        updateEstimate()
      })
      checkOut.addEventListener('change', updateEstimate)
      updateEstimate()
    })
})()