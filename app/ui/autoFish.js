const elt = require("./utils/elt.js");
const { ipcRenderer } = require("electron");

const renderLogo = () => {
  return elt(
    "div",
    { className: "logo" },
    elt("h1", { className: "logo_name" }, `AutoFish`),
    elt(
      "span",
      { className: "logo_link" },
      `by `,
      elt(
        "a",
        { href: `#`, onclick: () => ipcRenderer.send("open-link") },
        "olesgeras"
      )
    )
  );
};

const renderLogger = () => {
  return {
    dom: elt("section", { className: `logger` }),
    show({ text, type }) {
      let row = elt("p", null, text);
      row.style.color = type;
      this.dom.append(row);
      this.dom.scrollTop += 30;
    },
  };
};

class AutoFish {
  constructor(settings, startButton) {
    this.settings = settings;
    this.button = startButton;
    this.logger = renderLogger();

    this.settings.regOnChange((config) => {
      ipcRenderer.send('save-settings', config)
    });

    this.settings.regOnClick((config) => {
      ipcRenderer.send('advanced-settings', config)
    })

    this.button.regOnStart(() => {
      ipcRenderer.send("start-bot", this.settings.config);
    });

    this.button.regOnStop(() => {
      ipcRenderer.send("stop-bot");
    });

    ipcRenderer.on("stop-bot", () => {
      this.button.onError();
    });

    ipcRenderer.on("log-data", (event, data) => {
      this.logger.show(data);
    });

    this.dom = elt(
      "div",
      { className: "AutoFish" },
      renderLogo(),
      elt("p", {className: 'settings_header'}, "Settings:"),
      this.settings.dom,
      elt("p", {className: 'settings_header'}, "Log:"),
      this.logger.dom,
      this.button.dom,
      elt("p", {className: "version"}, "ver. 1.4.0")
    );
  }
}


module.exports = AutoFish;
