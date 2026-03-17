# Resilient DOM Selectors and Webview Interaction

This document is the core of the knowledgebase. It details the precise methods for locating and interacting with UI elements (specifically "Accept" or "Run" buttons) within the complex, dynamic Webviews of Google Antigravity.

## The Challenge

Antigravity Webviews, like modern VS Code interfaces, use:
1.  **Shadow DOMs:** Elements are isolated within shadow roots, meaning standard `document.querySelector` will not find them.
2.  **Web Components:** Custom tags like `<vscode-button>` instead of standard `<button>`.
3.  **Split Buttons:** Dropdown menus attached to the main button (e.g., "Accept" with a "Reject" chevron).
4.  **Transparent Overlays:** The IDE often places invisible `div`s over the UI to capture scrolling or block input, which intercept standard `.click()` events.

## 1. Robust Selectors

To find the "Accept" button reliably, you must cast a wide net that accounts for custom web components and accessibility roles.

**DO NOT USE:** `document.querySelectorAll('button')`

**USE THIS ROBUST APPROACH (Derived from `antigravity-autorun`):**

```javascript
// This selector string covers standard buttons, VS Code's custom Web Components,
// elements with the 'button' ARIA role, and common Monaco editor button classes.
const ACTION_NODE_SELECTOR = [
    'button',
    'vscode-button',
    '[role="button"]',
    '.monaco-button',
    '.monaco-text-button'
].join(', ');

// Crucial: You must query within the main document AND any Shadow Roots
// if the webview uses them.
const candidates = Array.from(document.querySelectorAll(ACTION_NODE_SELECTOR));

// Filtering the candidates:
const targetButton = candidates.find(btn => {
    const text = btn.textContent.toLowerCase().trim();
    // 1. Look for typical "Accept" keywords
    const isAccept = text === 'accept' || text === 'run' || text.includes('confirm');

    // 2. Explicitly ignore split-button dropdown chevrons
    const isDropdown = btn.classList.contains('codicon-chevron-down') ||
                       btn.className.includes('dropdown');

    // 3. Ensure the button is visible and not disabled
    const style = window.getComputedStyle(btn);
    const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
    const isEnabled = !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';

    return isAccept && !isDropdown && isVisible && isEnabled;
});
```

## 2. Bypassing Overlays with PointerEvents

The single biggest reason standard automation scripts fail in VS Code/Antigravity is the transparent overlay issue. An invisible `div` might be covering the button. Calling `targetButton.click()` will often fail silently.

To guarantee a click, you must simulate a human interaction using full `PointerEvent` dispatching, and temporarily disable any blocking layers.

**The Ultimate Click Sequence (Derived from `antigravity-autorun`):**

```javascript
function simulateResilientClick(button) {
    // 1. Find the center coordinates of the button
    const rect = button.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // 2. Check what element is *actually* at those coordinates
    // This reveals transparent blocking overlays
    const topElement = document.elementFromPoint(cx, cy);

    let originalPointerEvents = null;

    // 3. If the top element isn't our button (and isn't a child of it),
    // it's a blocking overlay. Temporarily disable its pointer events.
    if (topElement && topElement !== button && !button.contains(topElement)) {
        originalPointerEvents = topElement.style.pointerEvents;
        topElement.style.pointerEvents = 'none';
        console.log("Temporarily disabled blocking overlay");
    }

    // 4. Dispatch a full suite of events to simulate a real human mouse click.
    // This bypasses many framework-level event listeners that ignore synthetic .click()
    const opts = { bubbles: true, cancelable: true, view: window };

    button.dispatchEvent(new PointerEvent('pointerdown', opts));
    button.dispatchEvent(new MouseEvent('mousedown', opts));
    button.dispatchEvent(new PointerEvent('pointerup', opts));
    button.dispatchEvent(new MouseEvent('mouseup', opts));

    // 5. Fire standard click and keyboard fallback (Enter key)
    button.click();
    button.focus();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

    // 6. Restore the blocking overlay
    if (topElement && originalPointerEvents !== null) {
        topElement.style.pointerEvents = originalPointerEvents;
    }
}

// Usage:
if (targetButton) {
    simulateResilientClick(targetButton);
}
```

## 3. Dealing with Shadow DOM

If Antigravity Webviews utilize Shadow DOM (where elements are encapsulated in `#shadow-root`), `document.querySelectorAll` will not pierce the boundary.

To handle this, you need a recursive function that walks the DOM tree, diving into any element that has a `shadowRoot` property.

```javascript
// A recursive function to find elements inside Shadow DOM
function findElementsPiercingShadow(root, selector, result = []) {
    // 1. Query the current root
    const nodes = Array.from(root.querySelectorAll(selector));
    result.push(...nodes);

    // 2. Recursively search children for shadow roots
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
        if (el.shadowRoot) {
            findElementsPiercingShadow(el.shadowRoot, selector, result);
        }
    }

    return result;
}

// Usage:
const allCandidates = findElementsPiercingShadow(document, ACTION_NODE_SELECTOR);
```

---
**Next:** To make this injected payload safe and observable, read [04-Advanced-Features.md](./04-Advanced-Features.md) to implement Circuit Breakers, Visual Overlays, and Banned Command checking.