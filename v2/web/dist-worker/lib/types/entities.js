"use strict";
// ─── Shared Types for Entity System ──────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketOutcome = exports.ARGUMENT_TYPE_STYLES = exports.ARGUMENT_TYPE_LABELS = exports.ArgumentType = void 0;
// ─── Argument Types (matches Solidity enum in Comments.sol) ──────────────────
var ArgumentType;
(function (ArgumentType) {
    ArgumentType[ArgumentType["Discussion"] = 0] = "Discussion";
    ArgumentType[ArgumentType["Claim"] = 1] = "Claim";
    ArgumentType[ArgumentType["Counterclaim"] = 2] = "Counterclaim";
    ArgumentType[ArgumentType["Evidence"] = 3] = "Evidence";
    ArgumentType[ArgumentType["Source"] = 4] = "Source";
})(ArgumentType || (exports.ArgumentType = ArgumentType = {}));
exports.ARGUMENT_TYPE_LABELS = {
    [ArgumentType.Discussion]: "Discussion",
    [ArgumentType.Claim]: "Claim",
    [ArgumentType.Counterclaim]: "Counterclaim",
    [ArgumentType.Evidence]: "Evidence",
    [ArgumentType.Source]: "Source",
};
exports.ARGUMENT_TYPE_STYLES = {
    [ArgumentType.Discussion]: { bg: "transparent", text: "var(--ink-faint)", border: "var(--rule-light)" },
    [ArgumentType.Claim]: { bg: "var(--ink)", text: "var(--paper)", border: "var(--ink)" },
    [ArgumentType.Counterclaim]: { bg: "var(--accent-red)", text: "var(--paper)", border: "var(--accent-red)" },
    [ArgumentType.Evidence]: { bg: "transparent", text: "var(--ink-light)", border: "var(--rule)" },
    [ArgumentType.Source]: { bg: "transparent", text: "var(--ink-faint)", border: "var(--rule-light)" },
};
// ─── Prediction Market Types ────────────────────────────────────────────────
var MarketOutcome;
(function (MarketOutcome) {
    MarketOutcome[MarketOutcome["Unresolved"] = 0] = "Unresolved";
    MarketOutcome[MarketOutcome["For"] = 1] = "For";
    MarketOutcome[MarketOutcome["Against"] = 2] = "Against";
})(MarketOutcome || (exports.MarketOutcome = MarketOutcome = {}));
