import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameView } from "@runtime/gameTypes";
import { JournalTab } from "./tabs/JournalTab";
import { PeopleTab } from "./tabs/PeopleTab";
import { HereNowTab } from "./tabs/HereNowTab";

export const playerSheetMarkup = (game: GameView): string => renderToStaticMarkup(createElement(Fragment, null,
  createElement(JournalTab, { game }),
  ...(game.codex ? (["people", "places"] as const).map((page) => createElement(PeopleTab, { key: page, codex: game.codex as NonNullable<GameView["codex"]>, page })) : []),
  ...(game.scene ? [createElement(HereNowTab, { key: "here", scene: game.scene })] : [])));
