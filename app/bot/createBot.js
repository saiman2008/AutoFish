const Zone = require("../utils/zone.js");
const createFishingZone = require("./fishingZone.js");
const createNotificationZone = require("./notificationZone.js");
const createLootZone = require("./lootZone.js");

const { percentComparison, readTextFrom, sortWordsByItem } = require("../utils/textReader.js");
const { createTimer } = require("../utils/time.js");

const sleep = (time) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};
const random = (from, to) => {
  return from + Math.random() * (to - from);
};

const createBot = (game, { config, settings }, winSwitch) => {
  const { keyboard, mouse, workwindow } = game;
  const delay = [config.delay.from, config.delay.to];

  const action = async (callback) => {
    await winSwitch.execute(workwindow);
    await callback();
    winSwitch.finished();
  };

  const screenSize = workwindow.getView();

  const getDataFrom = (zone) => {
    return workwindow.capture(zone);
  };

  const fishingZone = createFishingZone({
    getDataFrom,
    zone: Zone.from(screenSize).toRel(config.relZone),
    redThreshold: config.redThreshold
  });

  const notificationZone = createNotificationZone({
    getDataFrom,
    zone: Zone.from(screenSize).toRel({
      x: 0.44,
      y: 0.12,
      width: 0.11,
      height: 0.07,
    })
  });

  const lootWindowPatch = config.lootWindow[screenSize.width < 1536 ? `1536` : `1920`];
  const lootWindow = {
    upperLimit: lootWindowPatch.upperLimit * screenSize.height,
    toItemX: lootWindowPatch.toItemX * screenSize.width,
    toItemY: lootWindowPatch.toItemY * screenSize.height,
    width: lootWindowPatch.width * screenSize.width,
    height: lootWindowPatch.height * screenSize.height,
    itemHeight: lootWindowPatch.itemHeight * screenSize.height
  };
  const whitelist = settings.whitelistWords.split(',').map(word => word.trim());

  const moveTo = ({ pos, randomRange }) => {
    if(randomRange) {
      pos.x = pos.x + random(-randomRange, randomRange);
      pos.y = pos.y + random(-randomRange, randomRange);
    }

    if (settings.likeHuman) {
      mouse.moveCurveTo(
        pos.x,
        pos.y,
        random(config.mouseMoveSpeed.from, config.mouseMoveSpeed.to),
        random(config.mouseCurvatureStrength.from, config.mouseCurvatureStrength.to)
      );
    } else {
      mouse.moveTo(pos.x, pos.y, delay);
    }
  };

  const checkBobberTimer = createTimer(() => {
    return config.maxFishTime;
  });

  const preliminaryChecks = () => {
    if (screenSize.x == -32000 && screenSize.y == -32000) {
      throw new Error("The window is in fullscreen mode");
    }

    let redColor = fishingZone.findBobber();
    if (redColor) {
      mouse.moveTo(redColor.x, redColor.y);
      throw new Error(
        `Found red colors before casting. Change the fishing place.`
      );
    }
  };

  const applyLures = async () => {
    await action(() => {
      keyboard.sendKey(settings.luresKey, delay);
    });
    await sleep(config.luresDelay);
  };

  applyLures.on = settings.lures;
  applyLures.timer = createTimer(() => {
    return settings.luresDelayMin * 60 * 1000;
  });

  const randomSleep = async () => {
    let sleepFor = random(
      config.randomSleepDelay.from,
      config.randomSleepDelay.to
    );
    await sleep(sleepFor);
  };

  randomSleep.on = config.randomSleep;
  randomSleep.timer = createTimer(() => {
    return random(config.randomSleepEvery.from, config.randomSleepEvery.to) * 60 * 1000;
  });

  const findAllBobberColors = () => {
    return fishingZone.getBobberPrint(5);
  };

  const castFishing = async (state) => {
    await action(() => {
      keyboard.sendKey(settings.fishingKey, delay);
    });

    if (state.status == "initial") {
      await sleep(250);
      if (notificationZone.check("error")) {
        throw new Error(`Game error notification occured on casting fishing.`);
      } else {
        state.status = "working";
      }
    }

    await sleep(config.castDelay);
  };

  const highlightBobber = async (pos) => {
    if(settings.likeHuman && random(0, 100) > 85) return pos;

    if (config.reaction) {
      let reaction = random(config.reactionDelay.from, config.reactionDelay.to);
      await sleep(reaction);
    }

    await action(() => {
      moveTo({ pos, randomRange: 5 });
    });

    return findBobber();
  };

  const findBobber = () => {
    return fishingZone.findBobber(findBobber.memory);
  };
  findBobber.memory = null;
  findBobber.maxAttempts = config.maxAttempts;

  const checkBobber = async (pos, state) => {
    checkBobberTimer.start();
    while (state.status == "working") {
      if (checkBobberTimer.isElapsed()) {
        throw new Error(
          `Something is wrong. The bot sticked to the bobber for more than ${config.maxFishTime} ms.`
        );
      }

      if (!fishingZone.isBobber(pos)) {
        const newPos = fishingZone.checkAroundBobber(pos);
        if (!newPos) {
          return pos;
        } else {
          pos = newPos;
        }
      }

      await sleep(config.checkingDelay);
    }
  };

  const pickLoot = async () => {
  let cursorPos = mouse.getPos();
  if (cursorPos.y - lootWindow.upperLimit < 0) {
    cursorPos.y = lootWindow.upperLimit;
  }

  await sleep(random(150, 250)); // open loot window
  await action(() => {
    let pos = {
      x: cursorPos.x + lootWindow.toItemX,
      y: cursorPos.y - lootWindow.toItemY - 10,
    };
    moveTo({ pos, randomRange: 5 });
  });
  await sleep(random(100, 200)); // hint dissappear

  const lootWindowDim = {
    x: cursorPos.x + lootWindow.toItemX,
    y: cursorPos.y - lootWindow.toItemY,
    width: lootWindow.width,
    height: lootWindow.height,
  };

  let recognizedWords = await readTextFrom(getDataFrom(lootWindowDim), 2);
  let items = sortWordsByItem(recognizedWords, lootWindow.itemHeight);
  let itemPos = 0;
  let itemsPicked = 0;
  for (let item of items) {
    let isInList;

    if (settings.whiteListBlueGreen) {
      isInList = createLootZone({
        getDataFrom,
        zone: {
          x: lootWindowDim.x,
          y: lootWindowDim.y + itemPos,
          width: lootWindow.width,
          height: lootWindow.itemHeight,
        },
      }).findItems("blue", "green");
    }

    if (!isInList) {
      isInList = whitelist.some((word) => {
        return percentComparison(word, item) > 70;
      });
    }

    if (isInList) {
      moveTo({
        pos: {
          x: cursorPos.x,
          y: cursorPos.y + itemPos,
        },
        randomRange: 5,
      });

      if (config.reaction) {
        await sleep(random(config.reactionDelay.from, config.reactionDelay.to)); 
      }
      await action(() => {
        mouse.toggle(true, "right", delay);
        mouse.toggle(false, "right", delay);
      });
      itemsPicked++;
    }


    itemPos += lootWindow.itemHeight;
  }

  if (items.length != itemsPicked) {
    await sleep(random(50, 150));
    await action(() => {
      keyboard.sendKey("escape", delay);
    });
  }
};


  const hookBobber = async (pos) => {
    if (config.reaction) {
      await sleep(random(config.reactionDelay.from, config.reactionDelay.to));
    }

    await action(() => {
      moveTo({ pos, randomRange: 5 });

      if (settings.shiftClick) {
        keyboard.toggleKey("shift", true, delay);
        mouse.click("right", delay);
        keyboard.toggleKey("shift", false, delay);
      } else {
        mouse.toggle(true,"right", delay);
        mouse.toggle(false, "right", delay);
      }
    });

    let caught = false;
    await sleep(250);
    if (!notificationZone.check("warning")) {
      caught = true;
      if(settings.whitelist && settings.whitelistWords !== ``) {
        await pickLoot();
      }
    }

    await sleep(settings.game == `Retail&Classic` ? 750 : 250); // close loot window delay
    if (config.sleepAfterHook) {
      await sleep(random(config.afterHookDelay.from, config.afterHookDelay.to));
    }

    return caught;
  };

  return {
    preliminaryChecks,
    findAllBobberColors,
    randomSleep,
    applyLures,
    castFishing,
    findBobber,
    highlightBobber,
    checkBobber,
    hookBobber,
  };
};

module.exports = createBot;
