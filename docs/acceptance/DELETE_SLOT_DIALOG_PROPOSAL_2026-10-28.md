# Delete one slot · visual proposal · 28 October 2026

**Status: owner decision pending.** The current Edit Slot button invokes JavaScript `confirm()`, which Android renders as a generic native AlertDialog. The proposed `design/review/delete-confirm-concept.html` / PNG shows a compact SHIFT CONTROL confirmation in both themes. The background is schematic; only the dialog is proposed.

The dialog names the slot and date, states that the other same-day slots stay intact, and offers a prominent Cancel action plus a separate destructive Delete Slot action. It contains no decorative eyebrow or tagline. The data operation remains deletion by existing slot ID; no change to stored facts, formulae, or navigation is proposed.

If approved, implement an accessible app dialog, verify Cancel leaves the slot untouched, Delete affects only the selected ID, and capture actual Android 35 dialog screens in dark/light at 360/390 dp. Owner visual verdict on those real Android results remains separate and **PENDING**.
