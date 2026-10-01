import { useState } from 'react'
import { planTrip } from './api'

const location = (value) => value.place || value.text

// the fields a plan depends on; driver and carrier details only fill in the sheets
export const tripKey = (form) =>
  [form.current.text, form.pickup.text, form.dropoff.text, form.cycle, form.start].join('\n')

// plan and error belong to the form values they were requested with (`key`)
export default function useTripPlan() {
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [key, setKey] = useState(null)

  async function submit(form) {
    if (loading) return false // Enter still submits while the button is disabled
    setLoading(true)
    setError('')
    setKey(tripKey(form))
    try {
      setPlan(await planTrip({
        current_location: location(form.current),
        pickup_location: location(form.pickup),
        dropoff_location: location(form.dropoff),
        current_cycle_used: Number(form.cycle),
        start_time: form.start,
      }))
      return true
    } catch (err) {
      // don't leave the previous trip on screen next to a form that no longer matches it
      setPlan(null)
      setError(err.message)
      return false
    } finally {
      setLoading(false)
    }
  }

  return { plan, error, loading, key, submit }
}
