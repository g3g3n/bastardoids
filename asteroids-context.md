We will build a 3D asteroids style game. Graphics can be simple 3D vector graphics with no textures (similar to original Elite).

Preferred language is TypeScript + Three.js

For a start game will have 1 infinite stage. Objects move on a 2-dimensional plane (xz). The plane itself is infinite (or loops on itself), with objects despawning when more than 2 playscreens away. Objects are 3D wireframe models. Game ends when player has no more lives.
Player ship (can be of triangular/pyramid shape, with narrower part as the front obviously), starting at the screen center, can be controlled using keyboard and mouse. Forward thrust can be applied using a "w" key on the keyboard and reverse thrust with a "s" key. Mouse movement controls where the ship is pointed, with the pointer being displayed as a small green crosshair. Player ship will turn itself to face the crosshairs at a relatively fast rate, but introduce some "drag" as if simulating RCS thrusters being used to turn the ship.
Player ship can freely move around the game screen. Camera stays fixed to its starting point until player ship gets to ~100px from the edge of the viewport, at which point the camera will smoothly recenter over the player ship.

For a start game will have 3 types of objects: player ship, larger asteroid and smaller asteroid.
Game should have simplistic newtonian-like physics. Objects should have a mass, with mass of a small asteroid 4 times that of the player ship, while the mass of a large asteroid is 7 times that of the player ship. Objects move at constant speeds and vectors, unless they are accelerating, decelerating, or hit another object. Object collision should be handled by the game's simple physics engine, taking objects' vectors, velocities and masses into account, all which will be influenced by the collision.

Game starts with the player ship stationary in the middle of the play area. Asteroids (small and large) periodically enter the scene from the outter edges moving at random, but constant speeds and vectors. Game should try to portray the 3D asteroids rotating along one of their axis.
Player ship (controlled by keyboard and mouse) can shoot red laser at the asteroids at a rate of 2 shots per second. If the laser shot makes contact with a small asteroid, the asteroid is destroyed along with the laser shot which hit it, and the player is awarded 1 point. If laser shot hits a large asteroid, the laser shot dissapears, while the asteroid gets split into two smaller asteroids that will start moving in different directions.

Collision handling details:

- collision response influenced by mass, velocity, and vector
- implement simple elastic-ish impulse resolution rather than true rigid-body simulation

Player motion:

- No passive drag
- W applies forward thrust
- S applies reverse thrust
- there should be a max speed; not too fast; also configurable through config file

Laser behavior:

- Fires along ship forward vector. There are two laser beams in a shot, each fired from one side/wing of the spaceship
- Has configurable speed and lifetime
- Inherits some of the ship’s current velocity

If a player ship makes contact with an asteroid, the player loses a life (starts with 6 lives). The game state is not reset but continues, with the player being granted 2 seconds of invulnerability (he can still collide with an asteroid during this time, but he does not lose a life). Asteroids are NOT destroyed upon contact with the player ship.

Asteroids should be entering the screen at random intervals, with around 3 per 8 seconds in the beginning. Rate of asteroid spawn increases progressively every 20 seconds by 1 additional asteroid per 8 seconds (spawn rate configurable).
Game ends when player has no lives left. Game should have a simple start menu that shows current high score (stored between game sessions) and the "START" clickable button which will start the game.

All of game object properties such as speeds, player acceleration/deceleration factor, level of camera zoom, rate of asteroid spawning, etc. should be stored in a separate file (text or JSON or whatever you prefer).
