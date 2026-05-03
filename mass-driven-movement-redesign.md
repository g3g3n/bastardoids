# Mass-Driven Ship Movement Redesign

## Summary
Rework ship movement so `mass` materially affects acceleration and turning, while keeping the rest of Bastardoids readable and tuneable.

Current state in `shipController.ts`:
- `thrust`, `reverseThrust`, and `strafeThrust` are applied directly as acceleration per second.
- `turnRate` adds angular velocity from heading error.
- `turnDamping` exponentially damps angular velocity.
- `mass` currently affects collisions, but not flight.
- speed caps are currently enforced by hard clamping

Recommended direction:
- Treat `mass` as literal ship tons for design purposes.
- Treat `thrust` values as force-like gameplay units, not acceleration.
- Keep `maxSpeed` and `strafeMaxSpeed` as explicit designer caps.
- Replace hard acceleration-into-cap with smooth thrust falloff near cap.
- Replace massless turning with a simple inertia-based yaw controller.
- Reserve an `enginePowerMw` hook now, but do not use it in movement yet.

## Implementation Changes
### 1. Translation: make mass matter directly
Use:
- `acceleration = thrustForce / mass`

Apply that on each driven axis:
- forward: `a_fwd = thrust / mass`
- reverse: `a_rev = reverseThrust / mass`
- strafe: `a_strafe = strafeThrust / mass`

Then integrate as now:
- `velocity += axisDirection * acceleration * delta`

Important decision:
- Do not multiply thrust by mass at runtime to preserve old feel automatically.
- Reinterpret ship `thrust` values as force-authority values and retune them per hull.

Example baseline:
- current player thrust feel is about `20 u/s²`
- if starter ship mass becomes `30`, preserving that same forward acceleration means:
  - `thrust = 600`
  - `reverseThrust = 480`
  - `strafeThrust = 360`

### 2. Replace hard speed-clamp feel with thrust falloff near cap
Do not add passive drag in the first pass.

Instead:
- when a ship is thrusting in the same direction as its current axis velocity, reduce effective acceleration as that axis approaches its cap
- when a ship is not thrusting, do not slow it down
- when a ship is thrusting opposite its current velocity, do not attenuate braking thrust

Use per-axis falloff:
- `normalized = clamp(abs(axisSpeed) / maxAxisSpeed, 0, 1)`
- `falloff = (1 - normalized) ^ capCurveExponent`
- `effectiveAcceleration = baseAcceleration * falloff`

Add one new config value:
- `speedCapCurveExponent: number`
  - default `1.5`
  - shared across forward/reverse/strafe in the first pass

Behavioral result:
- acceleration starts strong
- tapers smoothly near `maxSpeed`
- ships asymptotically approach top speed instead of hitting a hard wall
- coasting remains drag-free
- reverse thrusters still provide deliberate braking in vacuum

Keep a hard clamp only as a safety guard for:
- collision overspeed correction when desired
- afterburner edge cases
- numeric spikes

### 3. Rotation: use yaw inertia, not just raw turn acceleration
Replace the current massless yaw update with a torque/inertia style PD controller:

- `yawInertia = mass * radius^2 * yawInertiaFactor`
- `yawAccel = (turnRate * angleError - turnDamping * yawVelocity) / yawInertia`
- `yawVelocity += yawAccel * delta`
- `yaw += yawVelocity * delta`

Interpretation:
- `turnRate` becomes yaw control authority / torque-like response
- `turnDamping` becomes angular damping / stability assist
- `mass` and `radius` both reduce turn responsiveness
- larger ships turn worse even at equal mass because inertia scales with `radius^2`

Add:
- `yawInertiaFactor: number`
  - default `1.0`

### 4. New/changed config and type surface
Keep existing fields, but change semantics:
- `mass`: literal tons
- `thrust`, `reverseThrust`, `strafeThrust`: force-like authority values
- `turnRate`: rotational control authority
- `turnDamping`: angular damping coefficient

Add:
- `yawInertiaFactor: number`
- `speedCapCurveExponent: number`
- `enginePowerMw?: number` as a reserved future hook only

### 5. Power hook for later
When engine power is introduced later, add it as a second limit layer, not as a replacement for thrust authority.

Later direction:
- low speed: thrust limited by static engine force
- high speed: thrust limited by power using `P = F * v`

That later allows:
- `availableForce = min(staticThrust, powerLimitedForce)`

Do not implement this in the first pass.

## Tuning Defaults
Choose these defaults for the first implementation:
- Starting player ship mass: `30`
- Starting hunter mass: also convert to literal tons, likely `30` unless you want it heavier
- Preserve current starter-fighter feel by retuning thrust values upward rather than accepting the huge acceleration drop
- Keep `maxSpeed` explicit and unchanged for now
- Add `yawInertiaFactor = 1.0` to both player and hunter first
- Only change `turnRate` / `turnDamping` after the inertia controller is in place

Expected gameplay result:
- heavier ships accelerate more slowly with equal engines
- bigger ships feel more sluggish in yaw
- stronger engines can compensate for heavy hulls
- collision mass and movement mass finally describe the same thing

## Test Plan
Validate these scenarios:
- A `30 t` player ship with retuned thrust preserves roughly current accel feel.
- Doubling mass while keeping thrust constant halves linear acceleration.
- Increasing radius while keeping mass constant reduces turning responsiveness.
- A heavy ship reaches the same capped top speed eventually, but takes longer and with a smooth taper.
- Coasting with no thrust does not bleed speed.
- Reverse thrust near forward top speed still brakes strongly and does not feel atmospheric.
- Strafe correction opposite current lateral motion remains responsive.
- Collision behavior still works with the same `mass` values.
- AI ships remain controllable under the new yaw controller and do not become oscillatory.

## Assumptions
- World units remain abstract; only `mass` is treated as literal tons in the design model.
- `thrust` values are not Newtons; they are force-like gameplay units calibrated against tons and world-units-per-second.
- `maxSpeed` remains a designer cap rather than emerging from drag or power.
- No passive drag is introduced in the first pass.
- `enginePowerMw` is added only as a future-facing hook and is not used in ship motion yet.
