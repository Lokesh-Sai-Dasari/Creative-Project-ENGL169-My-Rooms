/* Memories — the lines that fall down the screen when you zoom in once on a thing.
   Keyed by room, then by the thing's name exactly as it shows in the panel.
   lines: plain strings, or { text, mono: true } for a sound-word (shown in typewriter type).
   sounds: their own steady loop, separate from the words — pattern [[sound, seconds from the start of the loop], ...]
   repeated every `cycle` seconds. Sounds: creak, spin, snore, snore1, yawn, chord, pool, break, clack, fridge, cutlery, rumble, sip, fold, flap, iron, game, mash, scribble, flip, riffle, sigh, doorOpen, knock, doorShut, rain, gust, bird, keys, drops, night. */
window.MEMORIES = {
  bedroom: {
    "the desk, and everything on it": {
      lines: [
        "Where all the late nights happen",
        "The lamp is the last light on in the house",
        "I built half my life on this desk",
        "Homework on one side, games on the other",
        "My elbows know every edge of it",
        "The lamp stays on long after everyone sleeps",
        "My first real setup, paid for by summer work",
        "It is always messier than I want it to be",
        "One more episode, then I start the essay",
        "Snack wrappers I swear I’ll throw away tomorrow"
      ],
      sounds: {
        pattern: [
          ["scribble", 0.6],
          ["keys", 3.8],
          ["flip", 9.2]
        ],
        cycle: 12
      }
    },
    "the mirror": {
      lines: [
        "Checking my hair before class",
        "Practicing what I will say",
        "Do I look tired, or is it the light?",
        "Pep talks before a big day",
        "The room looks bigger in it",
        "Making faces when no one is watching",
        "The same face every morning, a little different every year",
        "It shows my whole room, only backwards",
        "Is that really what I look like?",
        "Fixing my collar before I walk out"
      ]
    },
    "the gaming chair": {
      lines: [
        "Relaxing after a long day at school",
        {
          text: "Creak-creak",
          mono: true
        },
        {
          text: "spinning",
          mono: true
        },
        "Cold on my back in the winter",
        "Comfortable on my arms",
        "Spinning while I think of an answer",
        "Watching my sister play on my setup",
        "Rolling over to the bed without standing up",
        "It’s where I sit when I don’t want to sleep yet",
        "It creaks louder at night",
        "Leaning back for a movie",
        "The armrest is peeling from my elbows",
        {
          text: "Snoring",
          mono: true
        }
      ],
      sounds: {
        pattern: [
          ["creak", 1.2],
          ["spin", 4.4],
          ["creak", 7.6],
          ["snore", 10.6]
        ],
        cycle: 16.4
      }
    },
    "the guitar": {
      lines: [
        "C-major scale",
        "Phrygian mode",
        "Have to impress them at school",
        "The strings are a little out of tune again",
        "Power chords",
        "Flamenco",
        "Calluses I’m secretly proud of",
        "Throbbing fingers are no big deal",
        "Strumming at 3 AM",
        "Burning hot fingers",
        {
          text: "Reverberations",
          mono: true
        },
        "I taught myself one song at a time",
        "This tune will carry me far away beyond my reality",
        "It waits on the wall until I need it",
        "Playing quietly so no one hears me mess up"
      ],
      sounds: {
        pattern: [
          ["chord", 0.4],
          ["chord", 2.2],
          ["chord", 3.6],
          ["chord", 5.6],
          ["chord", 7],
          ["chord", 9.2]
        ],
        cycle: 11.5
      }
    },
    "the pool cue": {
      lines: [
        "Here comes a trick shot",
        "Can I make that angle?",
        "I can’t lose twice in a row!",
        "It hangs there like a promise of the weekend",
        {
          text: "Thud",
          mono: true
        },
        "It reminds me of the club every time I look up",
        "Not gonna scratch it",
        "I bought it after my first real win",
        "Sweaty palms",
        {
          text: "Tap",
          mono: true
        },
        "Practicing my stance in front of the mirror",
        "Chalk on my fingers",
        {
          text: "Sweeeervee",
          mono: true
        }
      ],
      sounds: {
        pattern: [
          ["break", 0.8],
          ["pool", 6],
          ["pool", 10]
        ],
        cycle: 14.5
      }
    },
    "the mini-fridge": {
      lines: [
        {
          text: "Growling",
          mono: true
        },
        "Do I have any leftovers?",
        "I miss my mom’s cooking",
        "I have too much junk in here",
        "Opening it just to feel the cold air",
        "A cold drink in the middle of an all-nighter",
        "Mouth-watering",
        "My own little stash, no one else’s",
        "Just gonna take a tiny bite!",
        "The hum keeps me company",
        "Am I hungry or just bored?",
        "Need a bite of that lasagna from last week",
        {
          text: "Lick",
          mono: true
        },
        "The snacks run out faster than they should"
      ],
      sounds: {
        pattern: [
          ["rumble", 0.4],
          ["fridge", 3.2],
          ["cutlery", 7.4],
          ["sip", 9.4],
          ["cutlery", 15.6]
        ],
        cycle: 18
      }
    },
    "the shelf of clothes": {
      lines: [
        "Folding for hours on end",
        "The pile I keep saying I’ll sort",
        "Ironing",
        "Is there a wrinkle still left?",
        "What matches with this Henley?",
        "Would it be weird if I wore the same outfit twice?",
        "Outfits I planned and never wore",
        "Clothes that still smell like home",
        {
          text: "Flap",
          mono: true
        },
        "It’s not cold enough for this!",
        "I should give some of these away",
        {
          text: "Sniff",
          mono: true
        },
        "Inhales the fresh scent of cashmere",
        "Am I lean enough to wear this?",
        "My favorite hoodie is always at the bottom"
      ],
      sounds: {
        pattern: [
          ["fold", 0.5],
          ["iron", 2.3],
          ["flap", 6],
          ["fold", 7.4],
          ["iron", 9.6],
          ["fold", 13.2]
        ],
        cycle: 15
      }
    },
    "the bed": {
      lines: [
        "I don’t have the strength to get up",
        {
          text: "Snoooooorreee",
          mono: true
        },
        "Way too cozy",
        "Sweltering heat",
        "Frost creeping into my skin",
        "Pillow is too flat",
        "The one place nobody asks me for anything",
        "Scrolling until my eyes give up",
        "Five more minutes, then five more",
        "Exhale a deep breath",
        "Rolling around",
        "I always end up on the same side",
        "Have to get back up... still work left to do",
        "Spots on the sheets I counted once when I couldn’t sleep",
        "I’ll worry about it tomorrow",
        {
          text: "Yawwwn",
          mono: true
        }
      ],
      sounds: {
        pattern: [
          ["snore", 0.8],
          ["snore", 6.2],
          ["yawn", 12]
        ],
        cycle: 15.5
      }
    },
    "the controller": {
      lines: [
        "Button mashing",
        "Sweaty hands",
        "I’m about to K.O. this guy!",
        "My thumbs know every button in the dark",
        "Just one more game before I sleep",
        "Rematch, right now",
        "I have to be quiet...",
        "The left stick drifts but I can’t let it go",
        "I don’t want to wake up my parents",
        {
          text: "Click-click",
          mono: true
        },
        "Agh, my sister got her sweat all over the controller",
        "Late-night wins nobody else saw",
        "Nooo, I was so close to winning",
        "Passing it to my sister without looking up",
        {
          text: "Smash",
          mono: true
        },
        "Sore thumbs",
        "If I lose, she’s gonna get the controller",
        "I need this after doing all those assignments"
      ],
      sounds: {
        pattern: [
          ["game", 0.4],
          ["mash", 1.6],
          ["game", 3.4],
          ["game", 4.6],
          ["mash", 6],
          ["game", 8.2],
          ["mash", 9.4],
          ["game", 11.2]
        ],
        cycle: 13
      }
    },
    "the study books": {
      lines: [
        "I need to lock in and get this over with",
        "My arm is so sore from writing",
        "Exasperated",
        "The spine finally cracked, so I must have read it",
        "2 more pages to go",
        "Tomorrow’s exam is gonna kill me",
        "Eyelids twitching",
        "Knuckle cracking",
        "Sticky notes like little flags of surrender",
        "Flipping through the textbook",
        "5 more minutes then I’m gonna take a break",
        "My future depends on this",
        "I’m so exhausted",
        "Spinning my pen",
        "The smell of new pages in August",
        "I’ll remember this chapter for the exam, then never again",
        "Highlighting everything, so nothing stands out"
      ],
      sounds: {
        pattern: [
          ["scribble", 0.4],
          ["flip", 3],
          ["scribble", 5],
          ["sigh", 7.8],
          ["riffle", 10.8],
          ["sigh", 15.6]
        ],
        cycle: 18.5
      }
    },
    "the door": {
      lines: [
        {
          text: "Knock-knock",
          mono: true
        },
        "Leaving it open a crack at night",
        "Dinner’s ready, come down!",
        "Closing it means do not disturb",
        "Shutting the world out for a while",
        "My name used to be taped on it",
        "Footsteps outside, then a knock",
        "Late for class again",
        "A strip of hallway light under the gap",
        {
          text: "Creeeak",
          mono: true
        },
        "Is anyone still awake?",
        "Home at last",
        "Walking out on the first day of school",
        {
          text: "Click",
          mono: true
        }
      ],
      sounds: {
        pattern: [
          ["knock", 0.4],
          ["doorOpen", 3.4],
          ["doorShut", 8.6]
        ],
        cycle: 13
      }
    },
    "the window": {
      lines: [
        {
          text: "Pitter-patter",
          mono: true
        },
        "Streetlights turning on one by one",
        "Sunlight on my pillow before my alarm",
        "Should I open it, or is it too cold?",
        "Watching the snow pile up",
        "Headlights sweeping the ceiling at midnight",
        {
          text: "Whoosh",
          mono: true
        },
        "I can hear the neighborhood through it",
        "Staring outside instead of studying",
        "The view hasn’t changed, but I have",
        "Watching the rain instead of my homework",
        "Birds louder than my alarm",
        "The glass fogs up when I breathe on it",
        "The first light of the day hitting my face"
      ],
      sounds: {
        pattern: [
          ["rain", 0.3],
          ["gust", 6.6],
          ["bird", 11.6]
        ],
        cycle: 17
      }
    }
  },
  kitchen: {
    "the big fridge": {
      lines: [
        {
          text: "Growling",
          mono: true
        },
        "Leftovers in boxes with no labels",
        "Do I have any leftovers?",
        "I miss my mom’s cooking",
        "I have too much junk in here",
        "Mouth-watering",
        "Just gonna take a tiny bite!",
        "The magnets from every trip we took",
        "Am I hungry or just bored?",
        "Need a bite of that lasagna from last week",
        {
          text: "Lick",
          mono: true
        },
        "Mom’s list stuck to the front"
      ],
      sounds: {
        pattern: [
          ["rumble", 0.4],
          ["fridge", 3.2],
          ["cutlery", 7.4],
          ["sip", 9.4],
          ["cutlery", 15.6]
        ],
        cycle: 18
      }
    },
    "my mom, cutting vegetables": {
      lines: [
        "I wish she would let me in the kitchen sometimes",
        "She never measures anything",
        "The sound of her knife is how I know dinner is coming",
        "Her food is the best!",
        "I want to help out",
        {
          text: "Chop chop chop",
          mono: true
        },
        "Smells delicious, as always!",
        "I wish I was as good as her",
        "She tells me to sit down and wait"
      ],
      sounds: {
        pattern: [
          ["chop", 0.5],
          ["chop", 2.6],
          ["sighF", 4.9],
          ["chop", 7],
          ["chop", 9]
        ],
        cycle: 11.5
      }
    },
    "the gas stove": {
      lines: [
        {
          text: "Hisssss",
          mono: true
        },
        "Waiting for the pan to get hot enough",
        "I need to make sure my little sister stays away",
        "Let me turn it down and slow cook",
        "Pots that have been here longer than me",
        {
          text: "Flame crackles",
          mono: true
        },
        "I can’t leave this gas on for too long!",
        "Just a few more minutes...",
        "That flame looks kind of weak",
        "Tea boiling over when I look away",
        "I’m almost done with the surprise dish!",
        "I’ll set the timer and be back in... 15 minutes"
      ],
      sounds: {
        pattern: [
          ["gas", 0.3],
          ["flame", 1.4],
          ["gas", 5.6],
          ["flame", 6.6]
        ],
        cycle: 11
      }
    },
    "the freezer": {
      lines: [
        "Time to put the marinade inside",
        {
          text: "Brrrrrr!",
          mono: true
        },
        "I hope I didn’t leave the soda in there for too long!",
        {
          text: "Clattering teeth",
          mono: true
        },
        "The ice trays nobody refills",
        "Cold air rolling out onto my feet",
        "If I’m quiet, mom won’t notice me sneaking an ice cream",
        "Just need to cool down a bit",
        "A bag of ice for every bump and bruise",
        "I really need some ice for this bruise"
      ],
      sounds: {
        pattern: [
          ["freezer", 0.5],
          ["brrr", 3.4],
          ["chatter", 5.6],
          ["freezer", 9.5]
        ],
        cycle: 13
      }
    },
    "the sink": {
      lines: [
        "So many dirty dishes",
        "Soap bubbles on the window",
        "Who left this here without scraping their plate?",
        {
          text: "Bubbles",
          mono: true
        },
        "My turn, again",
        {
          text: "Blub-blub",
          mono: true
        },
        "Soapy hands",
        "Talking with mom while I rinse",
        "I hate it when I have to do this chore",
        "And... this is not coming off...",
        "I wish we had a washing machine like in the States"
      ],
      sounds: {
        pattern: [
          ["tap", 0.4],
          ["dishes", 4.8],
          ["bubbles", 6.6],
          ["dishes", 11]
        ],
        cycle: 13.5
      }
    },
    "the chimney hood": {
      lines: [
        "Can’t forget to turn this on",
        "Steam fogging the steel",
        {
          text: "Cough cough",
          mono: true
        },
        "The spices are too strong!",
        "Mom’s reminder: turn the fan on",
        "So much smoke from the stir fry!",
        {
          text: "Humming",
          mono: true
        },
        "The kitchen smells like dinner for hours"
      ],
      sounds: {
        pattern: [
          ["hood", 0.4],
          ["sizzle", 4.8],
          ["cough", 7],
          ["hood", 9.4]
        ],
        cycle: 14.5
      }
    }
  },
  pool: {
    "the boom box, on a chair": {
      lines: [
        {
          text: "Dum-Dum Ba Dum",
          mono: true
        },
        "Replay this track",
        "This sets up the mood",
        "Arguing over who picks the next track",
        "The bass shakes the cue rack",
        "Never gets old!",
        "Let’s crank this up!",
        "A song that will always mean this room",
        "Vibing"
      ],
      sounds: {
        pattern: [
          ["boom", 0.4],
          ["boom", 2.2],
          ["boom", 4],
          ["boom", 7],
          ["boom", 8.8]
        ],
        cycle: 11
      }
    },
    "my friend, lining up a shot": {
      lines: [
        "I have to beat him!",
        "That angle isn’t going to work",
        "I’m glad he made time for this",
        "We should go pro",
        "Trash talk that’s half compliments",
        "One more game, then we’ll go",
        "I can’t lose this time!",
        "We’ve known each other longer than we’ve known this game",
        "He’s always there when I need to catch a break",
        "Can’t believe we spent so much time here"
      ],
      sounds: {
        pattern: [
          ["laugh", 1],
          ["laugh", 7.5]
        ],
        cycle: 13
      }
    },
    "the pool table": {
      lines: [
        "Glossy wood",
        "Soft green padding",
        "Chalk dust on the edges",
        "The sound of a ball rolling toward the pocket",
        "I’m gonna lean onto this for a ricochet",
        "Sliding my fingers across the table",
        "Gripping the sides anxiously",
        "The click of a clean break",
        "The rumble of rolling balls"
      ],
      sounds: {
        pattern: [
          ["roll", 0.5],
          ["roll", 5.5]
        ],
        cycle: 10.5
      }
    },
    "the lights": {
      lines: [
        "Elegance",
        "Luxury",
        "Dust drifting through the glow",
        "Everything outside the light disappears",
        "Calm and laid-back",
        "This really sets the mood for the climax",
        "The shadows add to the atmosphere",
        "This is what a perfect evening feels like",
        "Warm golden hue",
        "Shadows of the balls on the green"
      ],
      sounds: {
        pattern: [
          ["hum", 0.2],
          ["hum", 4],
          ["hum", 7.8]
        ],
        cycle: 11.5
      }
    }
  },
  campfire: {
    "the plants": {
      lines: [
        "Ferns brushing against my ankles",
        "The smell of pine and smoke",
        "Wildflowers nobody planted",
        "Something rustling behind us",
        "Damp leaves after the dew",
        "They were here long before us",
        "They’ll still be here when we’re gone",
        "The smell of wet earth"
      ],
      sounds: {
        pattern: [
          ["gust", 0.4]
        ],
        cycle: 6.6
      }
    },
    "the night sky": {
      lines: [
        "More stars than I have ever seen in the city",
        "The moon is watching too",
        "Every star is someone else’s night too",
        "Making a wish on the brightest one",
        "It feels like the edge of the world",
        "The Big Dipper, the only one I know",
        "The sky is bigger than any room",
        "So quiet up there"
      ],
      sounds: {
        pattern: [
          ["night", 0.5]
        ],
        cycle: 9.6
      }
    },
    "the fireflies": {
      lines: [
        {
          text: "Buzzzzzz",
          mono: true
        },
        "Blinking like they’re talking to each other",
        "Trying to catch one like when I was little",
        "Wobbling with the wind",
        "Glowing warm hue",
        "A motion picture in nature",
        "One landed on the guitar",
        "It is as if the air is charged with electricity",
        "I wish I could preserve that light and take it wherever I go"
      ],
      sounds: {
        pattern: [
          ["buzz", 0.3],
          ["buzz", 4.2],
          ["buzz", 8.1]
        ],
        cycle: 12
      }
    },
    "me, with the guitar": {
      lines: [
        "My fingers are dancing on the strings",
        "I surrender control to the melody",
        "My hands shake on the first chord",
        "Playing slower so the moment lasts",
        {
          text: "Strumming",
          mono: true
        },
        "I picked this song for tonight",
        "I can’t afford to mess up this bit",
        "I’ve practiced way too much to fail",
        "I am one with the instrument",
        "The vibrations are going through my body"
      ],
      sounds: {
        pattern: [
          ["practice", 0.4],
          ["practice", 4],
          ["practice", 7.6]
        ],
        cycle: 11.5
      }
    },
    "the girl beside me": {
      lines: [
        "Will she like this tune?",
        "I can see a sea of stars in her eyes",
        "Neither of us wants to leave first",
        "She laughs at the wrong note and I don’t mind",
        "I don’t know if this is the right song",
        "I really like the sweater she’s wearing",
        "Is this going well?",
        "What is she thinking?",
        "She looks pretty, as always",
        "Firelight on her face",
        "I won’t mess this up!"
      ],
      sounds: {
        pattern: [
          ["heart", 0.4],
          ["heart", 3.9],
          ["heart", 7.4]
        ],
        cycle: 10.5
      }
    },
    "the fire": {
      lines: [
        {
          text: "Crackling",
          mono: true
        },
        "Gentle warmth on the hairs of my arms",
        "Warm face, cold back",
        "Rejuvenated",
        "Dancing embers in the cold air",
        "Adding one more stick to keep it alive",
        "Smoke always finds my side",
        "I can stare forever even if it blinds me",
        "This pulls me closer to the present",
        "Reminds me of Lohri in India"
      ],
      sounds: {
        pattern: [
          ["fire", 0.2]
        ],
        cycle: 11.3
      }
    },
    "marshmallows on sticks": {
      lines: [
        "Gooey goodness",
        "A bit charred but that’s okay",
        "They’re just waiting to be gobbled",
        "How many times have I gone camping with these?",
        "I can never force it to go one way",
        {
          text: "Fluffy",
          mono: true
        },
        {
          text: "Squishy",
          mono: true
        },
        "Soft to touch",
        "I wonder if I should’ve stacked more on the sticks?",
        "Sticky fingers for the rest of the night",
        "The perfect golden one, finally",
        "Was this the best brand in the grocery store?",
        "Hold up... I forgot the crackers!",
        "Eating them faster than we toast them"
      ],
      sounds: {
        pattern: [
          ["squish", 0.6],
          ["squish", 4.6],
          ["squish", 8.8]
        ],
        cycle: 12.5
      }
    }
  }
};

/* Questions in the manner of Perec: plain, exact questions about ordinary things. One falls after the second memory, one at the end. */
window.PEREC_Q = {
  bedroom: {
    "the desk, and everything on it": [
      "What is under all these papers?",
      "How many hours have I spent here this year?"
    ],
    "the mirror": [
      "Who decided a mirror belongs beside the door?",
      "What does the room look like when no one is in front of it?"
    ],
    "the gaming chair": [
      "How many hours of my life have I spent in this chair?",
      "Why does the chair turn, when the room never does?"
    ],
    "the guitar": [
      "Why does it hang on the wall when no one is holding it?",
      "Where does the sound go after it leaves the room?"
    ],
    "the pool cue": [
      "Why is there a pool cue in a bedroom?",
      "What is a thing for, while it is only waiting?"
    ],
    "the mini-fridge": [
      "What is inside it right now, exactly, item by item?",
      "Why is there a small kitchen in my bedroom?"
    ],
    "the shelf of clothes": [
      "How many of these have I not worn in a year?",
      "Who decided that clothes belong on a shelf?"
    ],
    "the bed": [
      "Which side of the bed do I get out of, and since when?",
      "Of all the beds I have slept in, which will I remember?"
    ],
    "the controller": [
      "How many buttons have I pressed tonight?",
      "Where is my sister right now, while I play?"
    ],
    "the study books": [
      "How many pages have I turned and already forgotten?",
      "Which of these will I still own in ten years?"
    ],
    "the door": [
      "When I close it, which side am I on?",
      "Who is allowed to knock?"
    ],
    "the window": [
      "If I looked out for one hour and wrote down everything, what would I see?",
      "How much of the street outside do I really know?"
    ]
  },
  kitchen: {
    "the big fridge": [
      "Who put up each magnet, and when?",
      "What is the oldest thing inside?"
    ],
    "the freezer": [
      "How long can a thing be kept before it is forgotten?"
    ],
    "the sink": [
      "How many dishes pass through this sink in a year?",
      "Who decided that this chore was mine?"
    ],
    "the chimney hood": [
      "Where does the smoke go?",
      "After a minute, why do I stop hearing it?"
    ],
    "my mom, cutting vegetables": [
      "Why is the kitchen hers, and not mine?",
      "Who decided what each room is for?"
    ],
    "the gas stove": [
      "How many meals has this flame made?",
      "Would a kitchen still be a kitchen without a fire?"
    ]
  },
  pool: {
    "the boom box, on a chair": [
      "Why is a boom box sitting on a chair meant for a person?",
      "Does the music belong to the room, or to us?"
    ],
    "my friend, lining up a shot": [
      "Is a place ours because we keep coming back to it?",
      "In ten years, where will he be, and will this room still exist?"
    ],
    "the pool table": [
      "How many balls have dropped into these pockets?",
      "What is underneath the green cloth?"
    ],
    "the lights": [
      "What would this room be without them?",
      "When did I stop noticing them?"
    ]
  },
  campfire: {
    "the plants": [
      "Who decided where this clearing ends?"
    ],
    "the night sky": [
      "Where are my friends right now, under this same sky?"
    ],
    "the fireflies": [
      "Where do they go in the daytime?"
    ],
    "me, with the guitar": [
      "Can a song be a place?",
      "Where am I, exactly, while I am playing?"
    ],
    "the girl beside me": [
      "What will she remember of this place?",
      "Is a place made by who is in it?"
    ],
    "the fire": [
      "Why do we gather around a fire, and never around nothing?",
      "What will be left of it tomorrow morning?"
    ],
    "marshmallows on sticks": [
      "How many sticks, how many marshmallows, how many of us?",
      "Who taught me to toast them this way?"
    ]
  }
};
