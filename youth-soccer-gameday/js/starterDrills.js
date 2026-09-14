// A curated starting set of real, publicly published youth soccer drills a
// coach can load in one click via "Load Starter Drill Pack" on the Drill
// Library screen. Each entry links to a genuine coaching video rather than
// shipping any binary attachment, so the pack stays tiny and never eats
// into a device's localStorage headroom. Descriptions are original
// summaries, not copied from the linked source. ageGroups uses the same
// six bands as ageFormats.js (see PRESET_AGE_GROUPS in views/drills.js).
export const STARTER_DRILLS = [
  // Warm-up
  { name: 'Passing Warm-Up Drill', description: 'A short, structured passing sequence to open a session — gets players moving the ball and communicating before anything more demanding.', link: 'https://www.youtube.com/watch?v=iXOF18rS2D0', tags: ['Warm-up', 'Passing'], ageGroups: ['U8-U9', 'U10-U11'] },
  { name: 'Passing & Dribbling Warm-Up (5 Variations)', description: 'Five linked warm-up variations mixing passing and dribbling, so a coach can rotate through them across a season without repeating the same opener.', link: 'https://www.youtube.com/watch?v=2WmImvXDHVY', tags: ['Warm-up', 'Passing', 'Dribbling & Ball Control'], ageGroups: ['U10-U11', 'U12', 'U13'] },
  { name: 'Fun Warm-Up Games', description: 'Playful, game-based warm-ups aimed at younger players — keeps energy and engagement high while still raising heart rates before training.', link: 'https://www.youtube.com/watch?v=JSI-yeoH7C0', tags: ['Warm-up', 'Fun / Game-based'], ageGroups: ['U7', 'U8-U9'] },
  { name: 'Traffic Jam Warm-Up Game', description: 'A tag-style dribbling game where players weave through a crowded space without colliding — builds close control and spatial awareness in a fun format.', link: 'https://www.youtube.com/watch?v=SZE0dAdNqlo', tags: ['Warm-up', 'Fun / Game-based'], ageGroups: ['U7', 'U8-U9'] },

  // Passing
  { name: '10 Best Passing Drills', description: 'A rundown of ten passing exercises ranging from simple pairs work up to combination play, useful for building a progressive passing session.', link: 'https://www.youtube.com/watch?v=Kb58F3r_TQM', tags: ['Passing'], ageGroups: ['U8-U9', 'U10-U11', 'U12'] },
  { name: 'Triangle Passing: Movement & Third Man Run', description: 'Three players pass around a triangle shape while a fourth times a run off the ball — introduces the "third man" concept alongside basic passing accuracy.', link: 'https://www.youtube.com/watch?v=w8PbZQHf83M', tags: ['Passing'], ageGroups: ['U10-U11', 'U12', 'U13'] },
  { name: 'Pass & Move Combination', description: 'Players pass and immediately move into space to receive again, reinforcing the habit of moving after a pass rather than watching the ball.', link: 'https://www.youtube.com/watch?v=EDJKPs2Qcag', tags: ['Passing'], ageGroups: ['U8-U9', 'U10-U11', 'U12'] },
  { name: 'Pass & Move Perfection', description: 'A follow-up passing sequence that layers in first-touch direction and quicker decision-making once the basic pass-and-move pattern is solid.', link: 'https://www.youtube.com/watch?v=YjxyntcEjl4', tags: ['Passing'], ageGroups: ['U8-U9', 'U10-U11', 'U12'] },
  { name: 'Receiving and Turning', description: 'A simple receive-and-turn exercise for younger players, focused on checking shoulders and opening the body before the ball arrives.', link: 'https://www.youtube.com/watch?v=oBT0UlLlFlQ', tags: ['Passing'], ageGroups: ['U7', 'U8-U9'] },

  // Dribbling & Ball Control
  { name: 'U10 Dribbling Drills', description: 'A set of dribbling exercises pitched at U10 level, covering close control and changes of direction at a pace suited to that age.', link: 'https://www.youtube.com/watch?v=RukcQggHAZU', tags: ['Dribbling & Ball Control'], ageGroups: ['U10-U11'] },
  { name: '10 Best Dribbling Drills', description: 'Ten dribbling exercises for younger age groups, each focused on a specific skill (cuts, drags, speed dribbling) that can be run as its own station.', link: 'https://www.youtube.com/watch?v=eD2T5GXeaYE', tags: ['Dribbling & Ball Control'], ageGroups: ['U7', 'U8-U9', 'U10-U11'] },
  { name: 'Ball Mastery Compilation', description: 'A compilation of ball-mastery moves (toe taps, rolls, cuts) that can be run individually or strung together as a longer warm-up circuit.', link: 'https://www.youtube.com/watch?v=xtyDeFwvltA', tags: ['Dribbling & Ball Control'], ageGroups: ['U8-U9', 'U10-U11', 'U12'] },
  { name: 'Complete Technical Training: Ball Mastery, Dribbling, Turning', description: 'A longer, twelve-exercise technical session combining ball mastery, dribbling and turning work — well suited as a full training-block template for older age groups.', link: 'https://www.youtube.com/watch?v=Yp4k6eSGgWw', tags: ['Dribbling & Ball Control'], ageGroups: ['U12', 'U13', 'U14+'] },

  // Shooting
  { name: '4-Cone Shooting Drill', description: 'Players receive from one of four marked cones and strike on goal, adding a decision-making element (which cone, which angle) to a basic shooting drill.', link: 'https://www.youtube.com/watch?v=nA6DKYOhO54', tags: ['Shooting'], ageGroups: ['U10-U11', 'U12', 'U13'] },
  { name: 'U6-U8 Shooting Drill', description: 'A simple, low-pressure shooting drill designed for the youngest age groups, prioritising contact and technique over accuracy or power.', link: 'https://www.youtube.com/watch?v=umPwPtVTbfY', tags: ['Shooting'], ageGroups: ['U7', 'U8-U9'] },
  { name: '5 Essential Shooting Drills', description: 'Five shooting exercises covering the basics players need to finish reliably — first-time strikes, placement, and shooting under a defender.', link: 'https://www.youtube.com/watch?v=CVF_qsuac6E', tags: ['Shooting'], ageGroups: ['U10-U11', 'U12', 'U13', 'U14+'] },

  // Defending
  { name: '1v1 Defending Drills', description: 'A block of 1v1 defending exercises focused on body position, patience, and timing the tackle rather than diving in.', link: 'https://www.youtube.com/watch?v=ceMFekk-xdE', tags: ['Defending'], ageGroups: ['U10-U11', 'U12'] },
  { name: '3 Best 1v1 Drills', description: 'Three fast-paced 1v1 exercises that put both attacker and defender under repeated pressure — useful as a short, high-intensity session block.', link: 'https://www.youtube.com/watch?v=5dCgkhnedPk', tags: ['Defending'], ageGroups: ['U10-U11', 'U12', 'U13'] },
  { name: 'Rotating 1v1 Defending Drill', description: 'A queue-based 1v1 defending drill where players rotate through attacker and defender roles, keeping numbers working continuously without long waits.', link: 'https://www.youtube.com/watch?v=7bWP2Ygwm_o', tags: ['Defending'], ageGroups: ['U12', 'U13', 'U14+'] },
  { name: "Don't Dive In: 1v1 Defending", description: 'A drill built specifically around the common fault of defenders committing to a tackle too early — rewards patience and jockeying instead.', link: 'https://www.youtube.com/watch?v=uVkpeXS6Byw', tags: ['Defending'], ageGroups: ['U10-U11', 'U12'] },
  { name: '10 Best Defending Drills', description: 'Ten defending exercises spanning individual 1v1 work through to small-group defensive shape, suitable for building a full defending-themed session.', link: 'https://www.youtube.com/watch?v=MDF6tB5foI0', tags: ['Defending'], ageGroups: ['U8-U9', 'U10-U11', 'U12'] },

  // Possession / Rondo
  { name: '8v3 Rondo', description: 'A classic large-group rondo — eight players keep possession against three, sharpening quick passing and pressing triggers for the defenders.', link: 'https://www.youtube.com/watch?v=9jQRQsnyfKw', tags: ['Possession / Rondo'], ageGroups: ['U10-U11', 'U12', 'U13'] },
  { name: 'Double Square Rondo', description: 'A rondo variation using two connected squares, adding a passing-range and decision-making layer on top of standard possession play.', link: 'https://www.youtube.com/watch?v=D2vHV6dMvqo', tags: ['Possession / Rondo'], ageGroups: ['U10-U11', 'U12', 'U13', 'U14+'] },
  { name: 'Over The River Possession', description: 'Two teams keep possession in a zone split by a "river" the ball cannot be played through directly, forcing switches of play and patience.', link: 'https://www.youtube.com/watch?v=ATfIAwc5iLw', tags: ['Possession / Rondo'], ageGroups: ['U10-U11', 'U12', 'U13'] },
  { name: 'Pressing + Possession Drill', description: 'Combines possession-keeping with an active pressing team, so players practise both retaining the ball under pressure and organising a press to win it back.', link: 'https://www.youtube.com/watch?v=T0zkMg0ftgs', tags: ['Possession / Rondo'], ageGroups: ['U10-U11', 'U12', 'U13'] },

  // Small-Sided Games
  { name: 'Flip The Pitch', description: 'A small-sided game where scoring in either direction is live, encouraging quick transitions and discouraging players from switching off after losing the ball.', link: 'https://www.youtube.com/watch?v=tj-19D9bXQw', tags: ['Small-Sided Games'], ageGroups: ['U10-U11', 'U12', 'U13'] },
  { name: 'Small-Sided Games: 5 Variations', description: 'Five small-sided game formats a coach can rotate through in one session, each emphasising a slightly different in-game problem.', link: 'https://www.youtube.com/watch?v=9ojC_3pd-3k', tags: ['Small-Sided Games'], ageGroups: ['U8-U9', 'U10-U11', 'U12'] },
  { name: 'Power of Three', description: 'A small-sided game built around groups of three, rewarding combination play and quick support rather than individual dribbling.', link: 'https://www.youtube.com/watch?v=RtiRDRWaXNY', tags: ['Small-Sided Games'], ageGroups: ['U10-U11', 'U12'] },
  { name: 'Small-Sided Games for Penetrating Passes', description: 'A small-sided format with scoring conditions that specifically reward forward, penetrating passes rather than safe sideways possession.', link: 'https://www.youtube.com/watch?v=oNYEqlRwvs8', tags: ['Small-Sided Games'], ageGroups: ['U12', 'U13', 'U14+'] },
  { name: 'Attacking Small-Sided Game', description: 'A small-sided game weighted toward the attacking team, giving forwards extra practice creating and finishing chances against a set defence.', link: 'https://www.youtube.com/watch?v=wu3bGcvzt2s', tags: ['Small-Sided Games'], ageGroups: ['U10-U11', 'U12', 'U13'] },

  // Fitness & Conditioning
  { name: 'Agility Speed Ladder Drills', description: 'Speed-ladder footwork patterns aimed at youth players, building coordination and quick feet without any ball involved.', link: 'https://www.youtube.com/watch?v=WmewYBj2duY', tags: ['Fitness & Conditioning'], ageGroups: ['U10-U11', 'U12', 'U13', 'U14+'] },
  { name: 'Fast Feet Training Drills', description: 'A set of quick-feet conditioning drills that double as a fun activation exercise before moving on to ball work.', link: 'https://www.youtube.com/watch?v=Ft4u3i6WftU', tags: ['Fitness & Conditioning'], ageGroups: ['U10-U11', 'U12', 'U13'] },
  { name: 'Best Agility Drills', description: 'A collection of cone- and ladder-based agility drills for improving change of direction, useful as a short conditioning block within a session.', link: 'https://www.youtube.com/watch?v=uW-CQtKoMdA', tags: ['Fitness & Conditioning'], ageGroups: ['U10-U11', 'U12', 'U13', 'U14+'] },
  { name: '16 Fitness Drills', description: 'Sixteen conditioning exercises covering speed, agility and endurance — a useful reference for building a standalone fitness session for older age groups.', link: 'https://www.youtube.com/watch?v=3fcuQGdhGjk', tags: ['Fitness & Conditioning'], ageGroups: ['U12', 'U13', 'U14+'] },

  // Goalkeeping
  { name: 'Reaction Training, Angles, and Ready Position', description: 'Goalkeeper-specific work on the ready position, closing down angles, and reacting quickly to shots — core fundamentals for any keeper.', link: 'https://www.youtube.com/watch?v=58eZb2reR94', tags: ['Goalkeeping'], ageGroups: ['U10-U11', 'U12', 'U13', 'U14+'] },
  { name: 'Top Drill for Goalkeepers', description: 'A single focused exercise for young goalkeepers, aimed at building handling confidence in a low-pressure, repetition-based setting.', link: 'https://www.youtube.com/watch?v=R64Fz8qX7UQ', tags: ['Goalkeeping'], ageGroups: ['U8-U9', 'U10-U11'] },
  { name: '7 Fun Goalkeeper Drills for Kids', description: 'Seven playful goalkeeping games aimed at the youngest keepers, keeping the position fun rather than isolating them from the rest of training.', link: 'https://www.youtube.com/watch?v=BHsPdQ7EnZM', tags: ['Goalkeeping'], ageGroups: ['U7', 'U8-U9', 'U10-U11'] },
  { name: '1v1 With Goalkeeper(s)', description: 'A competitive 1v1-to-goal exercise with a keeper included, so both the attacker’s finishing and the keeper’s shot-stopping get live repetitions together.', link: 'https://www.youtube.com/watch?v=hqCDeWmvxgI', tags: ['Goalkeeping', 'Small-Sided Games'], ageGroups: ['U10-U11', 'U12'] },
  { name: '9 Essential Goalkeeping Skills', description: 'A broader run-through of nine core goalkeeping skills, useful as a reference session plan for a keeper-specific training day with older players.', link: 'https://www.youtube.com/watch?v=k1i6kWXi2Ls', tags: ['Goalkeeping'], ageGroups: ['U12', 'U13', 'U14+'] },

  // Set Pieces
  { name: 'Smarter Free Kicks', description: 'Coaching points and set patterns for taking free kicks with more purpose, aimed at helping young players make better decisions rather than just striking hard.', link: 'https://www.youtube.com/watch?v=8vnZ7N4rT9E', tags: ['Set Pieces'], ageGroups: ['U12', 'U13', 'U14+'] },
  { name: 'Offensive Corner Kick Techniques', description: 'A look at attacking corner-kick routines and near-post/far-post runs, giving a team a couple of repeatable options rather than an unplanned scramble.', link: 'https://www.youtube.com/watch?v=RuMB38FSIdU', tags: ['Set Pieces'], ageGroups: ['U12', 'U13', 'U14+'] },
  { name: 'Corner Kicks at U9/U10 (7v7)', description: 'Corner-kick routines simplified for the smaller 7v7 format typical at U9/U10, keeping the pattern easy to remember for younger players.', link: 'https://www.youtube.com/watch?v=KcJEITSMxLY', tags: ['Set Pieces'], ageGroups: ['U8-U9', 'U10-U11'] },

  // Cool-down
  { name: 'Post-Training Cool-Down', description: 'A short, low-intensity cool-down routine to close out a session — light movement and stretching to bring heart rates back down before players head home.', link: 'https://www.youtube.com/watch?v=60Zr3pn69iM', tags: ['Cool-down'], ageGroups: ['U7', 'U8-U9', 'U10-U11', 'U12', 'U13', 'U14+'] },

  // Fun / Game-based
  { name: '100 Fun Training Ideas', description: 'A large reference list of fun, game-based training ideas — handy for a coach looking to swap in a fresh activity without repeating the same few games every week.', link: 'https://www.youtube.com/watch?v=hdrmEnoSMWw', tags: ['Fun / Game-based'], ageGroups: ['U7', 'U8-U9', 'U10-U11'] },
  { name: 'Fun Drills For Kids (Volume 2)', description: 'A second round-up of light, game-based drills for the youngest players, prioritising enjoyment and repeated ball touches over structured tactics.', link: 'https://www.youtube.com/watch?v=RpHv9vQ4wXI', tags: ['Fun / Game-based'], ageGroups: ['U7', 'U8-U9'] },
  { name: '5 Fun Soccer Drills for Kids', description: 'Five simple, playful drills pitched at the very youngest players, built around games rather than isolated technical repetition.', link: 'https://www.youtube.com/watch?v=s0WW2U-OStI', tags: ['Fun / Game-based'], ageGroups: ['U7'] },
];
