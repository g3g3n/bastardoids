let's implement something cool. We will introduce a new "heat" mechanic. It should have it's own gauge, similar to afterburner, but it starts empty.
Gauge should be positioned in the upper left of the screen, below the element that holds current lives, speed, etc. Non-player ships (eg. hunter) also have their own heat gauge which is not displayed anywhere. but game should keep track of it. It some code should be refactored to allow for this, let me know.
Gauge should go from 0 to 150, and should have markings at 100 and 150. Gauge meter fills as weapons are used by player and progressively goes from green to yellow to orange and at 100 to 150 gauge meter will turn red.
Each ship should have a new variable/property (remind me of what these are actually called) called "vent". Set it to 20 for all ships. This will define how quickly ships passively dispense heat, per second.
Each weapon should have a new property/variable (again not sure of the proper term here) called "heat". Set it to 35 for laser, 60 for kineticTorpedo and 45 for plasmaOrb. This will determine how much heat each shot with this weapon generates.

Ships cannot fire a weapon if firing it would cause their current heat to go over 150. Any ship in play whose current heat is above 100 has their total "vent" stat multiplied by 0.65 (so slower venting while above 100 heat). This multiplier goes away when ship's heat is back to 100 or lower.

ADDITIONAL CONTEXT FOR FUTURE:
At some later point we will introduce a shield system which nearly every ship will have, which will protect ship's health and slowly regenerate over time. Heat over 100 will probably start draining ship's shield.