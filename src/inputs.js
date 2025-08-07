
import { EventEmitter } from 'events'

import packageJSON from '../package.json'
var version = packageJSON.version

function DefaultOptions() {
    this.preventDefaults = false
    this.stopPropagation = false
    this.allowContextMenu = false
    this.disabled = false
    this.maxPointerMovement = 100
}


export class GameInputs {

    /**
     *   Simple inputs manager to abstract key/mouse inputs.
     * 
     * @param {HTMLElement} domElement
     * @param {DefaultOptions} options
    */

    constructor(domElement, options) {
        this.version = version
        var opts = Object.assign({}, new DefaultOptions(), options || {})

        // settings
        /** The HTMLElement that `inputs` is bound to. */
        this.element = domElement || document
        /** When true, all key events with bindings will call `preventDefaults`. */
        this.preventDefaults = !!opts.preventDefaults
        /** When true, all key events with bindings will call `stopPropagation`. */
        this.stopPropagation = !!opts.stopPropagation
        /** When this is false, the context menu will be prevented from opening if there is a binding to the right mouse button. */
        this.allowContextMenu = !!opts.allowContextMenu
        /** When disabled, no binding events will fire. */
        this.disabled = !!opts.disabled

        /** 
         * Optional filter function. Useful if you want to, e.g., 
         * ignore a key binding if ctrl/alt are pressed, but allow that
         * same binding if it originated from a mouse event.
         * @param {KeyboardEvent & MouseEvent} ev
         * @param {string} bindingName
        */
        this.filterEvents = (ev, bindingName) => true

        // emitters
        /** 
         * Event emitter for binding **press** events.  
         * The original mouse or key event will be passed as an argument.
        */
        this.down = new EventEmitter()
        /** 
         * Event emitter for binding **release** events.  
         * The original mouse or key event will be passed as an argument.
         */
        this.up = new EventEmitter()

        /** 
         * The boolean state of whether each binding is currently pressed.
         * 
         * `inputs.state['move-left'] // true if a bound key is pressed`
         * @type {{ [key:string]: boolean }} 
        */
        this.state = {}

        /** 
         * Numeric counters representing accumulated pointer/scroll inputs 
         * since the last time `tick` was called.
        */
        this.pointerState = {
            dx: 0,
            dy: 0,
            scrollx: 0,
            scrolly: 0,
            scrollz: 0,
        }

        /** 
         * If the mouse movement is over 4 times larger than the previous one,
         * and the movement is larger than maxPointerMovement, we just ignore it.
         * @type {number}
         */
        this.maxPointerMovement = opts.maxPointerMovement || 0

        /**
         * How many times each binding has been **pressed**
         * since the last time `tick` was called.
         * @type {{ [key:string]: number }} 
        */
        this.pressCount = {}

        /** 
         * How many times each binding has been **released** 
         * since the last time `tick` was called.
         * @type {{ [key:string]: number }} 
        */
        this.releaseCount = {}



        // internal state
        /** @private @type {{ [key:string]: string[] }}   code -> [...binding names] */
        this._keyBindmap = {}
        /** @private @type {{ [key:string]: boolean }} code -> isDown */
        this._keyStates = {}
        /** @private @type {{ [key:string]: number }}  bindingName -> currCt */
        this._bindPressCount = {}
        /** @private */
        this._touches = { lastX: 0, lastY: 0, currID: null }


        // register for ALL THE dom events
        if (document.readyState !== 'loading') {
            initEvents(this)
        } else {
            document.addEventListener('DOMContentLoaded', ev => {
                initEvents(this)
            }, { once: true })
        }
    }


    /**
     * Binds one or more physical keys to an arbitrary binding name.
     * Key strings should align to `KeyboardEvent.code` strings - 
     * e.g. `KeyA`, `ArrowDown`, etc.
     * 
     * `inputs.bind('move-player-left', 'KeyW', 'ArrowLeft')
     * 
     * @param {string} bindingName 
     * @param {...string} keys 
     */
    bind(bindingName, ...keys) {
        keys.forEach(code => {
            var bindings = this._keyBindmap[code] || []
            if (bindings.includes(bindingName)) return
            bindings.push(bindingName)
            this._keyBindmap[code] = bindings
        })
        this.state[bindingName] = !!this.state[bindingName]
        this.pressCount[bindingName] = this.pressCount[bindingName] || 0
        this.releaseCount[bindingName] = this.releaseCount[bindingName] || 0
    }


    /**
     * Removes all key bindings for a given binding name.
     * 
     * `inputs.unbind('move-player-left')
     */
    unbind(bindingName) {
        for (var code in this._keyBindmap) {
            var bindings = this._keyBindmap[code]
            var i = bindings.indexOf(bindingName)
            if (i > -1) { bindings.splice(i, 1) }
        }
    }

    /**
     * Returns a copy of all existing bindings, in the format:
     * ```js
     *   {
     *      bindingName: [ keyCode1, keyCode2, ... ]
     *      ...
     *   }
     * ```
     */
    getBindings() {
        var res = {}
        for (var code in this._keyBindmap) {
            var bindings = this._keyBindmap[code]
            bindings.forEach(bindingName => {
                res[bindingName] = res[bindingName] || []
                res[bindingName].push(code)
            })
        }
        return res
    }


    /**
     * Tick function - clears out all cumulative counters
    */
    tick() {
        zeroAllProperties(this.pointerState)
        zeroAllProperties(this.pressCount)
        zeroAllProperties(this.releaseCount)
    }
}

function zeroAllProperties(obj) {
    for (var key in obj) obj[key] = 0
}






/*
 *
 *   PRIVATE FUNCTIONS
 *
*/

/** @param {GameInputs} inputs */
function initEvents(inputs) {
    // keys
    window.addEventListener('keydown', onKeyEvent.bind(null, inputs, true), false)
    window.addEventListener('keyup', onKeyEvent.bind(null, inputs, false), false)

    // pointer/mouse events
    var pointerOpts = { passive: true }


    inputs.element.addEventListener("touchstart", onTouchStart.bind(undefined, inputs), {passive: false})
    inputs.element.addEventListener("touchend", onTouchEnd.bind(undefined, inputs), pointerOpts)
    inputs.element.addEventListener("mousedown", onPointerEvent.bind(null, inputs, true), pointerOpts)
    window.document.addEventListener("mouseup", onPointerEvent.bind(null, inputs, false), pointerOpts)

    inputs.element.addEventListener("touchmove", onPointerMove.bind(null, inputs), pointerOpts)
    inputs.element.addEventListener("mousemove", onPointerMove.bind(null, inputs), pointerOpts)

    if (window.PointerEvent) {
        // inputs.element.addEventListener("pointerdown", onPointerEvent.bind(null, inputs, true), pointerOpts)
        // window.document.addEventListener("pointerup", onPointerEvent.bind(null, inputs, false), pointerOpts)
        // inputs.element.addEventListener("pointermove", onPointerMove.bind(null, inputs), pointerOpts)
    } else {
        // inputs.element.addEventListener("mousedown", onPointerEvent.bind(null, inputs, true), pointerOpts)
        // window.document.addEventListener("mouseup", onPointerEvent.bind(null, inputs, false), pointerOpts)
        // inputs.element.addEventListener("mousemove", onPointerMove.bind(null, inputs), pointerOpts)
    }
    inputs.element.addEventListener("wheel", onWheelEvent.bind(null, inputs), pointerOpts)
    inputs.element.addEventListener("contextmenu", onContextMenu.bind(null, inputs), false)

    // doc-level blur event for edge cases
    window.addEventListener("blur", onWindowBlur.bind(null, inputs), false)
}


// experimental - for touch events, extract useful dx/dy
var lastTouchX = 0
var lastTouchY = 0
var currTouchId = null
function onTouchStart(inputs, ev) {
    ev.preventDefault() // Prevent vibration on long hold

    updateCurrTouch(ev)
}
function updateCurrTouch(ev) {
    let touchIdExists = false
    for (let i = 0; i < ev.touches.length; ++i) {
        if (ev.touches[i].identifier === currTouchId) {
            touchIdExists = true
            break
        }
    }

    if (!touchIdExists) {
        const touch = ev.changedTouches[0]
        lastTouchX = touch.clientX
        lastTouchY = touch.clientY
        currTouchId = touch.identifier
    }
}
function onTouchEnd(inputs, ev) {
    // For the touchend event, changedTouches is a list of the touch points that have been removed from the surface. Need to null out since chrome reuses identifiers once a touch ends.
    var touches = ev.changedTouches
    for (var i = 0; i < touches.length; ++i) {
        if (touches[i].identifier === currTouchId) {
            currTouchId = null
        }
    }
}

function getTouchMovement(ev) {
    updateCurrTouch(ev)

    for (let i = 0; i < ev.changedTouches.length; ++i) {
        if (ev.changedTouches[i].identifier == currTouchId) {
            const touch = ev.changedTouches[i]
            const res = [touch.clientX - lastTouchX, touch.clientY - lastTouchY]
            lastTouchX = touch.clientX
            lastTouchY = touch.clientY
            return res
        }
    }

    console.error(`Did not find touch id ${currTouchId}`)
    return [0, 0]
}





/*
 *
 *
 *      INTERNALS - DOM EVENT HANDLERS
 *
 *
*/

function onKeyEvent(inputs, nowDown, ev) {
    handleKeyEvent(ev.code, nowDown, inputs, ev)
}

function onPointerEvent(inputs, nowDown, ev) {
    // if pointer events supported, only track the first
    if ('pointerId' in ev) {
        if (nowDown) {
            if (inputs._touches.currID !== null) return
            inputs._touches.currID = ev.pointerId
        } else {
            if (inputs._touches.currID !== ev.pointerId) return
            inputs._touches.currID = null
        }
    }
    var button = ('button' in ev) ? (ev.button + 1) : 1
    handleKeyEvent('Mouse' + button, nowDown, inputs, ev)
    return false
}

function onPointerMove(inputs, ev) {
    // if a touch exists, ignore movement of other touches
    // if ('pointerId' in ev && inputs._touches.currID !== null) {
        // if (inputs._touches.currID !== ev.pointerId) return
    // }
    // fire no events, just expose the state data
    var dx = ev.movementX || ev.mozMovementX || 0,
        dy = ev.movementY || ev.mozMovementY || 0

    if (ev.touches && (dx | dy) === 0) {
        var xy = getTouchMovement(ev)
        dx = xy[0]
        dy = xy[1]
    }

    // Apply movement filtering if enabled to detect browser bugs
    if (inputs.maxPointerMovement > 0) {
        var badx = Math.abs(dx) > inputs.maxPointerMovement && Math.abs(dx / lastx) > 4
        var bady = Math.abs(dy) > inputs.maxPointerMovement && Math.abs(dy / lasty) > 4

        if (badx || bady) {
            // Ignore this movement as it's likely a browser bug
            dx = 0
            dy = 0

            lastx = (lastx + dx) / 2
            lasty = (lasty + dy) / 2
        } else {
            inputs.pointerState.dx += dx
            inputs.pointerState.dy += dy

            lastx = dx || 1
            lasty = dy || 1
        }
    }
}

var lastx = 0
var lasty = 0

/*
 * 
 *      mousewheel / scroll handling...
 * 
 */

function onWheelEvent(inputs, ev) {
    var scale = 1
    switch (ev.deltaMode) {
        case 0: scale = 1; break  // Pixel
        case 1: scale = 12; break  // Line
        case 2:  // page
            // TODO: investigate when this happens, what correct handling is
            scale = inputs.element.clientHeight || window.innerHeight
            break
    }
    // accumulate state
    inputs.pointerState.scrollx += (ev.deltaX || 0) * scale
    inputs.pointerState.scrolly += (ev.deltaY || 0) * scale
    inputs.pointerState.scrollz += (ev.deltaZ || 0) * scale
}


/*
 *
 *          Edge cases...
 *
*/

function onContextMenu(inputs, ev) {
    if (!inputs.allowContextMenu) {
        ev.preventDefault()
        return false
    }
}

function onWindowBlur(inputs) {
    // at least some browsers handle mouse events correctly here
    // but not keys, so on window blur simulate a keyUp for all pressed keys
    // there may be a better way to handle this someday..
    for (var code in inputs._keyStates) {
        if (!inputs._keyStates[code]) continue
        if (/^Mouse\d/.test(code)) continue
        handleKeyEvent(code, false, inputs, {
            code: code,
            note: `This is a mocked KeyboardEvent made by the 'game-inputs' module`,
            preventDefault: () => { },
            stopPropagation: () => { },
        })
    }
}




/*
 *
 *
 *          FINAL KEY BIND HANDLING
 *
 *
*/

// tracks the state/counts of individual physical keys
function handleKeyEvent(code, nowDown, inputs, ev) {
    var bindings = inputs._keyBindmap[code]
    if (!bindings) return

    // if the key state has changed, handle the event for all bindings
    var prevState = inputs._keyStates[code]
    if (XOR(prevState, nowDown)) {
        inputs._keyStates[code] = nowDown
        bindings.forEach(bindingName => {
            // allow client to filter events if applicable
            var allow = (inputs.filterEvents) ?
                inputs.filterEvents(ev, bindingName) : true
            if (!allow) return
            // finally emit the event
            handleBindingEvent(bindingName, nowDown, inputs, ev)
        })
    }

    // prevent/stop only for non-mouse events
    if (!('button' in ev)) {
        if (inputs.preventDefaults && !ev.defaultPrevented) {
            ev.preventDefault()
        }
        if (inputs.stopPropagation) ev.stopPropagation()
    }

}


// tracks the state/counts of virtual bindings
function handleBindingEvent(bindingName, pressed, inputs, ev) {
    // externally, track *cumulative* press/release counts
    var counter = (pressed) ? inputs.pressCount : inputs.releaseCount
    counter[bindingName] = (counter[bindingName] || 0) + 1
    // internally, track *current* press count (to handle overlapping keybinds)
    var ct = inputs._bindPressCount[bindingName] || 0
    ct += pressed ? 1 : -1
    if (ct < 0) { ct = 0 } // shouldn't happen
    inputs._bindPressCount[bindingName] = ct

    // emit event if binding's state has changed
    var currstate = inputs.state[bindingName]
    if (XOR(currstate, ct)) {
        inputs.state[bindingName] = (ct > 0)
        var emitter = pressed ? inputs.down : inputs.up
        if (!inputs.disabled) emitter.emit(bindingName, ev)
    }
}




/*
 *
 *
 *    HELPERS
 *
 *
*/


// how is this not part of Javascript?
function XOR(a, b) {
    return a ? !b : b
}




