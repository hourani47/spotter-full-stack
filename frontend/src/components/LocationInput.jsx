import PropTypes from 'prop-types'
import { locationValueType } from '../propTypes'
import { useEffect, useId, useRef, useState } from 'react'
import { searchLocations } from '../api'

// value is { text, place }. place stays null until a suggestion is picked.
export default function LocationInput({ label, placeholder, value, onChange }) {
  const id = useId()
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [searching, setSearching] = useState(false)
  const typed = useRef(false)
  const input = useRef(null)

  useEffect(() => {
    // don't search again for the suggestion that was just picked
    if (!typed.current || value.text.trim().length < 3) {
      setSuggestions([])
      setSearching(false)
      return
    }
    const controller = new AbortController()
    // the place search can take a few seconds
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const places = await searchLocations(value.text, controller.signal)
        setSuggestions(places)
        setActive(-1)
        // results can come back after the user has tabbed away
        setOpen(document.activeElement === input.current)
        setSearching(false)
      } catch {
        // aborted or offline, free text still works
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 280)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [value.text])

  function pick(place) {
    typed.current = false
    onChange({ text: place.label, place })
    setOpen(false)
  }

  function onKeyDown(event) {
    if (!open || !suggestions.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((active + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((active - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      pick(suggestions[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && suggestions.length > 0

  return (
    <div className="field location">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={input}
        type="text"
        maxLength={200}
        required
        autoComplete="off"
        placeholder={placeholder}
        value={value.text}
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${id}-option-${active}` : undefined}
        aria-busy={searching}
        onChange={(event) => {
          typed.current = true
          onChange({ text: event.target.value, place: null })
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && searching && !showList && (
        <p className="suggestions searching" role="status">Looking up places…</p>
      )}
      {showList && (
        <ul className="suggestions" id={`${id}-list`} role="listbox">
          {suggestions.map((place, index) => (
            <li
              key={`${place.label}-${place.lat}`}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'active' : undefined}
              // mousedown, because click comes after the blur closes the list
              onMouseDown={(event) => {
                event.preventDefault()
                pick(place)
              }}
            >
              {place.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

LocationInput.propTypes = {
  label: PropTypes.string.isRequired,
  placeholder: PropTypes.string,
  value: locationValueType.isRequired,
  onChange: PropTypes.func.isRequired,
}
