# Mass-Driven Ship Movement Redesign

## Summary
Rework ship movement so `mass` materially affects acceleration and turning, while keeping the rest of Bastardoids readable and tuneable.

Current state in `shipController.ts`:
- `thrust`, `reverseThrust`, and `strafeThrust` are applied directly as acceleration per second.
- `turnRate` adds angular velocity from heading error.
- `turnDamping` exponentially damps angular velocity.
- `mass` currently affects collisions, but not flight.

Recommended direction:
- Treat `mass` as literal ship tons for design purposes.
- Treat `thrust` values as **force-like gameplay units**, not acceleration.
- Keep `maxSpeed` and `strafeMaxSpeed` as explicit designer caps.
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

Then integrate exactly as you do now:
- `velocity += axisDirection * acceleration * delta`
- keep `maxSpeed` / `strafeMaxSpeed` caps

Important decision:
- Do **not** multiply thrust by mass at runtime to “make it work.” That cancels the gameplay value of mass.
- Instead, reinterpret ship `thrust` values as force-authority values and retune them per hull.

Example baseline:
- current player thrust feel is about `20 u/s²`
- if starter ship mass becomes `30`, preserving that same forward acceleration means:
  - `thrust = 600`
  - `reverseThrust = 480`
  - `strafeThrust = 360`

So for a 30-ton starfighter:
- same thrust authority as before: similar feel, but now mass scaling works across hulls
- same thrust number as before: ship becomes dramatically slower, which is probably not desired

### 2. Rotation: use yaw inertia, not just raw turn acceleration
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

This is the best grounded compromise for your current game:
- more physical than the current controller
- still stable and easy to tune
- keeps `turnDamping` useful as a fly-by-wire / control-system stat

### 3. New/changed config and type surface
Keep existing fields, but change semantics:
- `mass`: literal tons
- `thrust`, `reverseThrust`, `strafeThrust`: force-like authority values, not acceleration
- `turnRate`: rotational control authority
- `turnDamping`: angular damping coefficient

Add one new ship stat:
- `yawInertiaFactor: number`
  - default `1.0`
  - used to differentiate compact vs spread-out ships of similar mass

Add one reserved hook, not used yet:
- `enginePowerMw?: number`
  - stored on ship configs/types only
  - no runtime effect in this pass

### 4. Power hook for later
When you decide to use engine power, add it as a second limit layer, not as a replacement for thrust authority.

Later formula direction:
- low speed: thrust limited by static engine force
- high speed: thrust limited by power, using `P = F * v`

That means later you can do:
- `availableForce = min(staticThrust, powerLimitedForce)`
- where `powerLimitedForce ≈ enginePower / speed`

Do **not** introduce this in the first pass. It complicates tuning too early and behaves badly near zero speed unless carefully clamped.

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
- A heavy ship reaches the same capped top speed eventually, but takes longer to get there.
- Collision behavior still works with the same `mass` values.
- AI ships remain controllable under the new yaw controller and do not become oscillatory.

Concrete tuning checks:
- Compare `30 t` vs `60 t` ship with identical thrusters.
- Compare two `30 t` ships with different radii.
- Verify reverse and strafe feel proportionally weaker for heavier ships.
- Verify player and hunter both still converge on target heading without wobble spikes.

## Assumptions
- World units remain abstract; only `mass` is treated as literal tons in the design model.
- `thrust` values are not Newtons; they are force-like gameplay units calibrated against tons and world-units-per-second.
- `maxSpeed` remains a designer cap rather than emerging from drag/power.
- `enginePowerMw` is added only as a future-facing hook and is not used in ship motion yet.
