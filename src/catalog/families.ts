export interface FamilyProfile { bundle: string; checks: [string, string, string] }
export const familyProfiles: Record<string, FamilyProfile> = {
  "console": {
    "bundle": "Console, one standard controller and power lead; no games, adapters or original box",
    "checks": [
      "Known-good media boots; controls and video output pass.",
      "One connector has intermittent contact; the console still boots.",
      "The console fails repeated boot or media-read tests."
    ]
  },
  "handheld": {
    "bundle": "Handheld unit only; no games, detachable charger, case or original box",
    "checks": [
      "Display, controls and known-good game media pass the test.",
      "One control has intermittent contact; the system still boots.",
      "The display or game-media reader fails repeated tests."
    ]
  },
  "computer": {
    "bundle": "Computer only; no separate monitor, keyboard, mouse, media or original box",
    "checks": [
      "Startup, memory and available input/output tests pass.",
      "One input/output connector is intermittent; startup passes.",
      "Startup or memory diagnostics fail repeatedly."
    ]
  },
  "handheld-computer": {
    "bundle": "Handheld computer only; no charger, dock, removable media or original box",
    "checks": [
      "Display, input and local storage tests pass.",
      "One input control is intermittent; saved data remains accessible.",
      "The display or local storage fails repeated tests."
    ]
  },
  "keyboard": {
    "bundle": "Keyboard with its attached cable; no adapters or original box",
    "checks": [
      "Every key registers consistently in the test.",
      "One key intermittently fails to register.",
      "Several keys fail to register; internal repair is needed."
    ]
  },
  "calculator": {
    "bundle": "Calculator only; no cover, batteries, manual or original box",
    "checks": [
      "Display, keypad and arithmetic checks pass.",
      "One key requires repeated pressure; arithmetic checks pass.",
      "The display or calculation test fails consistently."
    ]
  },
  "synth": {
    "bundle": "Instrument only; no stand, external power supply, speakers or original box",
    "checks": [
      "Controls and audio output pass the bench test.",
      "One control is intermittent; the main audio path works.",
      "The audio path or several controls fail repeated tests."
    ]
  },
  "pedal": {
    "bundle": "Pedal only; no power supply, patch cables or original box",
    "checks": [
      "Switching, controls and the audio path pass.",
      "The switch needs repeated pressure; the audio circuit works.",
      "Audio drops out repeatedly when the effect is engaged."
    ]
  },
  "guitar": {
    "bundle": "Instrument only; no case, stand, amplifier or original box",
    "checks": [
      "Neck alignment, hardware and pickup output pass the test.",
      "A hardware or electrical contact needs routine service.",
      "A structural or electrical defect requires professional repair."
    ]
  },
  "film-camera": {
    "bundle": "Camera body, or fixed-lens camera; no detachable lens, film, case or original box",
    "checks": [
      "Shutter operation and film transport pass the test.",
      "Film transport is stiff or light seals require replacement.",
      "The shutter or film transport fails repeated tests."
    ]
  },
  "digital-camera": {
    "bundle": "Camera body and battery; no detachable lens, charger, card, case or original box",
    "checks": [
      "Capture, image storage and display tests pass.",
      "One control is intermittent; capture and storage work.",
      "Capture or image storage fails repeated tests."
    ]
  },
  "instant-camera": {
    "bundle": "Camera only; no film, case or original box",
    "checks": [
      "A test film pack confirms shutter and ejection operation.",
      "The rollers require cleaning or adjustment.",
      "The shutter or film-ejection mechanism fails repeated tests."
    ]
  },
  "drone": {
    "bundle": "Aircraft, controller and one battery; no charger, spare parts or original box",
    "checks": [
      "Motor, control-link and camera tests pass on the bench.",
      "One battery or propeller component needs replacement.",
      "A motor or flight-control fault is detected; do not fly before repair."
    ]
  },
  "portable-audio": {
    "bundle": "Player only; no headphones, media, detachable charger or original box",
    "checks": [
      "Playback, controls and audio output pass using test media.",
      "A control or power contact is intermittent; playback works.",
      "Playback or audio output fails repeated tests."
    ]
  },
  "turntable": {
    "bundle": "Turntable with fitted cartridge; no speakers, amplifier, records or original box",
    "checks": [
      "Speed stability, tonearm and audio output pass.",
      "A control or drive component needs cleaning or service.",
      "Speed stability or tonearm operation fails the test."
    ]
  },
  "headphones": {
    "bundle": "Headphones and standard cable; no case, adapters or original box",
    "checks": [
      "Both channels and cable continuity pass.",
      "Pads or a cable connection require replacement.",
      "A driver or cable fault repeatedly interrupts one channel."
    ]
  },
  "microphone": {
    "bundle": "Microphone only; no cable, stand, clip or original box",
    "checks": [
      "Output and connector continuity pass.",
      "The connector has intermittent contact.",
      "The capsule or internal wiring fails the audio test."
    ]
  },
  "phone": {
    "bundle": "Phone only; no SIM, detachable charger, accessories or original box",
    "checks": [
      "Power, display, input and local audio tests pass; network compatibility is not promised.",
      "A control or power contact needs service; local tests otherwise pass.",
      "Power or display tests fail repeatedly."
    ]
  },
  "quartz-watch": {
    "bundle": "Watch with attached strap or bracelet; no spare links, box or papers",
    "checks": [
      "Display or hands, setting controls and timekeeping pass; no water-resistance certification.",
      "A consumable or setting control requires routine service.",
      "Timekeeping or setting operation fails repeatedly."
    ]
  },
  "mechanical-watch": {
    "bundle": "Watch with attached strap or bracelet; no spare links, box or papers",
    "checks": [
      "The movement runs consistently within the scenario tolerance; no pressure certification.",
      "The movement runs but needs timing adjustment or service.",
      "The movement stops intermittently and needs professional service."
    ]
  },
  "typewriter": {
    "bundle": "Typewriter only; no case, fresh ribbon, paper or original box",
    "checks": [
      "Keys, carriage advance and return pass with a test ribbon.",
      "A key or carriage control sticks and needs cleaning.",
      "The carriage or type mechanism jams repeatedly."
    ]
  },
  "pen": {
    "bundle": "Pen only; no ink, refill, case or original box",
    "checks": [
      "Writing and closure tests pass with test writing supplies; authentication is not certified.",
      "A seal or mechanism needs routine service.",
      "A writing mechanism or body closure fails the test."
    ]
  },
  "lighter": {
    "bundle": "Lighter body and fitted insert; no fuel, flints or original box",
    "checks": [
      "Hinge and insert fit pass a dry mechanical check; no fuel is supplied.",
      "The hinge or consumable holder needs routine service.",
      "The hinge or insert mechanism fails the dry check."
    ]
  },
  "tool": {
    "bundle": "Tool only; no pouch, replacement parts or original box",
    "checks": [
      "Joints, locks and tool alignment pass the mechanical check.",
      "A joint is stiff and requires cleaning or adjustment.",
      "A locking or structural component fails the mechanical check."
    ]
  },
  "lamp": {
    "bundle": "Lamp only; no bulb, mounting hardware or original box",
    "checks": [
      "Switch, cable and mechanical adjustments pass a safety check.",
      "An adjustment or switch needs routine service.",
      "An electrical or structural defect is found; repair before use."
    ]
  },
  "furniture": {
    "bundle": "Single furniture item; no accessories, protective covers or retail packaging",
    "checks": [
      "Joints, supports and load-bearing surfaces pass the check.",
      "A fitting or contact surface needs routine refurbishment.",
      "A structural joint fails the check and needs professional repair."
    ]
  },
  "radio": {
    "bundle": "Radio only; no batteries, detachable power supply or original box",
    "checks": [
      "Tuning, controls and local audio output pass.",
      "A tuning or volume control has intermittent contact.",
      "Reception or audio output fails repeated tests."
    ]
  },
  "electronic-toy": {
    "bundle": "Main toy unit only; no batteries, accessories or original box",
    "checks": [
      "Power, controls and the model's basic play functions pass.",
      "A control or battery contact needs cleaning.",
      "The basic electronic play test fails repeatedly."
    ]
  },
  "puzzle": {
    "bundle": "Puzzle only; no stand, guide or original box",
    "checks": [
      "All moving sections turn and align correctly.",
      "One moving section catches and needs adjustment.",
      "A broken internal part prevents normal puzzle movement."
    ]
  },
  "toy": {
    "bundle": "Main toy unit only; no optional accessories or original box",
    "checks": [
      "The model's primary mechanical play function passes.",
      "A moving part is stiff and needs adjustment.",
      "A broken component prevents the primary play function."
    ]
  },
  "construction-set": {
    "bundle": "NXT controller, three motors, sensors and cables; no building pieces, batteries, instructions or box",
    "checks": [
      "Controller, motors and included sensors pass.",
      "One cable or sensor has intermittent contact.",
      "The controller or a motor fails repeated tests."
    ]
  }
};
