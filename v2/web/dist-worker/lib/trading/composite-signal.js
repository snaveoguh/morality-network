"use strict";
/**
 * composite-signal.ts — Merges technical, AI pattern, and news signals.
 *
 * Weights (configurable via env vars):
 *   Technical: 40%  |  AI Pattern: 30%  |  News: 30%
 *
 * If a source is unavailable, its weight is redistributed proportionally.
 * Below minSignalConfidence = no trade. Requires 2-of-3 agreement on direction.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCompositeSignal = computeCompositeSignal;
/* ═══════════════════  Default Weights  ═══════════════════ */
function getWeights() {
    const t = parseFloat(process.env.SIGNAL_WEIGHT_TECHNICAL || "0.4");
    const p = parseFloat(process.env.SIGNAL_WEIGHT_PATTERN || "0.3");
    const n = parseFloat(process.env.SIGNAL_WEIGHT_NEWS || "0.3");
    const total = t + p + n;
    return {
        technical: t / total,
        pattern: p / total,
        news: n / total,
    };
}
function newsToDirection(d) {
    return d === "bullish" ? "long" : "short";
}
function directionScore(dir) {
    if (dir === "long")
        return 1;
    if (dir === "short")
        return -1;
    return 0;
}
/* ═══════════════════  Main export  ═══════════════════ */
function computeCompositeSignal(args) {
    const { symbol, technical, pattern, newsSignal, minConfidence, overrideWeights } = args;
    const baseWeights = overrideWeights ?? getWeights();
    // Determine which sources are available
    const hasTechnical = technical !== null && technical.direction !== "neutral";
    const hasPattern = pattern !== null && pattern.overallDirection !== "neutral";
    const hasNews = newsSignal !== null;
    // Redistribute weights if sources are missing
    let wTech = hasTechnical ? baseWeights.technical : 0;
    let wPat = hasPattern ? baseWeights.pattern : 0;
    let wNews = hasNews ? baseWeights.news : 0;
    const totalWeight = wTech + wPat + wNews;
    if (totalWeight > 0) {
        wTech /= totalWeight;
        wPat /= totalWeight;
        wNews /= totalWeight;
    }
    // Compute weighted directional score (-1 to +1)
    let weightedScore = 0;
    let weightedConfidence = 0;
    const reasons = [];
    if (hasTechnical && technical) {
        const techScore = directionScore(technical.direction) * technical.strength;
        weightedScore += techScore * wTech;
        weightedConfidence += technical.confidence * wTech;
        reasons.push(`Technical: ${technical.direction} (strength ${technical.strength.toFixed(2)})`);
    }
    if (hasPattern && pattern) {
        const patScore = directionScore(pattern.overallDirection) * pattern.overallConfidence;
        weightedScore += patScore * wPat;
        weightedConfidence += pattern.overallConfidence * wPat;
        const patternNames = pattern.patterns.map((p) => p.name).join(", ");
        reasons.push(`Patterns: ${pattern.overallDirection} [${patternNames || "none"}]`);
    }
    if (hasNews && newsSignal) {
        const newsDir = newsToDirection(newsSignal.direction);
        const newsStrength = Math.min(1, newsSignal.score / 2); // normalize score to 0-1 range
        const newsScore = directionScore(newsDir) * newsStrength;
        weightedScore += newsScore * wNews;
        weightedConfidence += newsStrength * wNews;
        reasons.push(`News: ${newsSignal.direction} (score ${newsSignal.score.toFixed(2)})`);
    }
    // Determine direction from weighted score
    let direction = "neutral";
    if (weightedScore > 0.05)
        direction = "long";
    else if (weightedScore < -0.05)
        direction = "short";
    // Confidence = weighted confidence + boost from agreement
    const confidence = Math.min(1, weightedConfidence);
    // 2-of-3 agreement check
    const directions = [];
    if (hasTechnical && technical)
        directions.push(technical.direction);
    if (hasPattern && pattern)
        directions.push(pattern.overallDirection);
    if (hasNews && newsSignal)
        directions.push(newsToDirection(newsSignal.direction));
    const longVotes = directions.filter((d) => d === "long").length;
    const shortVotes = directions.filter((d) => d === "short").length;
    const agreementMet = directions.length <= 1 || // only 1 source = auto-agree
        (direction === "long" && longVotes >= 2) ||
        (direction === "short" && shortVotes >= 2);
    // If no agreement, downgrade to neutral
    if (!agreementMet) {
        reasons.push("Direction disagreement — 2-of-3 agreement not met, forcing neutral");
        direction = "neutral";
    }
    // Below minimum confidence = neutral
    if (confidence < minConfidence && direction !== "neutral") {
        reasons.push(`Confidence ${confidence.toFixed(2)} below minimum ${minConfidence}`);
        direction = "neutral";
    }
    return {
        symbol,
        timestamp: Date.now(),
        direction,
        confidence: direction === "neutral" ? 0 : confidence,
        components: {
            technical: hasTechnical && technical
                ? { direction: technical.direction, strength: technical.strength, confidence: technical.confidence, weight: wTech }
                : null,
            pattern: hasPattern && pattern
                ? { direction: pattern.overallDirection, confidence: pattern.overallConfidence, patterns: pattern.patterns.map((p) => p.name), weight: wPat }
                : null,
            news: hasNews && newsSignal
                ? { direction: newsToDirection(newsSignal.direction), score: newsSignal.score, weight: wNews }
                : null,
        },
        agreementMet,
        reasons,
    };
}
