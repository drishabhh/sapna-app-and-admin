package com.rishu.sapnahealth;

/**
 * Streak "personality" for the home-screen widget. Pure Java (no Android types) so it can be unit-tested.
 * KEEP IN SYNC with src/lib/mood.ts — a parity test compares both over a grid of inputs.
 */
final class MoodEngine {
    static final class Mood {
        final String id, doodle, title, sub, tone;
        final boolean lit;

        Mood(String id, String doodle, String title, String sub, String tone, boolean lit) {
            this.id = id; this.doodle = doodle; this.title = title; this.sub = sub; this.tone = tone; this.lit = lit;
        }
    }

    private static String milestone(int s) {
        switch (s) {
            case 3: return "a habit is starting";
            case 7: return "one full week";
            case 14: return "two weeks strong";
            case 21: return "officially a habit";
            case 30: return "a whole month";
            case 50: case 75: return "unstoppable";
            case 100: case 150: case 200: return "a legend";
            case 365: return "a full year";
            default: return (s > 0 && s % 100 == 0) ? "a legend" : null;
        }
    }

    private static String fill(String s, String name, int n) {
        return s.replace("{name}", name).replace("{n}", String.valueOf(n));
    }

    /** gap: whole days since she last logged anything; null = never. */
    static Mood compute(String name, int streak, boolean done, boolean workout, Integer gap, boolean comeback, int hour, int dayIndex) {
        if (gap == null) return m(name, streak, "fresh", "eating", "Fuel first", "Log your first meal, {name}. That is day one.", "warm", false);

        if (done) {
            if (comeback) return m(name, streak, "comeback", "love", "Welcome back!", "Day 1 again, {name}. We go again.", "warm", true);
            String ms = milestone(streak);
            if (ms != null) return m(name, streak, "milestone", "celebrate", "{n}-day streak!", "{name}, that is " + ms + ".", "warm", true);
            int v = Math.floorMod(dayIndex, 2);
            if (workout) {
                return v == 0
                    ? m(name, streak, "workout-a", "cheer", "Beast mode, {name}!", "Workout and a log. Unreal.", "warm", true)
                    : m(name, streak, "workout-b", "flex", "Strong work", "Streak safe and muscles earned.", "warm", true);
            }
            if (hour >= 21) return m(name, streak, "night", "sleep", "Sleep well", "Day {n} done. See you tomorrow, {name}.", "cool", true);
            if (streak >= 14) return m(name, streak, "locked", "flex", "Locked in", "{n} days and counting.", "warm", true);
            if (streak >= 7) return m(name, streak, "fire", "fire", "On fire", "{n} days. Do not stop now.", "warm", true);
            if (streak >= 3) {
                return v == 0
                    ? m(name, streak, "good-a", "thumbs", "Nice streak", "{n} days in a row.", "warm", true)
                    : m(name, streak, "good-b", "bottle", "Stay hydrated", "Day {n} done. Keep sipping.", "warm", true);
            }
            return v == 0
                ? m(name, streak, "early-a", "cheeks", "Day {n} done", "Small steps add up.", "warm", true)
                : m(name, streak, "early-b", "phone", "Rishu will be proud", "Day {n} is logged.", "warm", true);
        }

        if (gap == 1 && streak > 0) {
            if (hour < 11) return m(name, streak, "morning", "cap", "Good morning!", "Day {n} starts with one log.", "warm", true);
            if (hour < 16) return m(name, streak, "midday", "plan", "Time to log a meal", "Keep your {n}-day streak going.", "warm", true);
            if (hour < 20) return m(name, streak, "evening", "point", "Hey {name}...", "Your {n}-day streak needs you.", "hot", true);
            return m(name, streak, "late", "shocked", streak >= 7 ? "Do not lose {n} days!" : "Streak ends at midnight!", "Log anything to save it.", "hot", true);
        }

        int g = gap;
        if (g <= 2) return m(name, streak, "missed", "sad", "We missed you", "Streak reset. Log today for day 1.", "cool", false);
        if (g == 3) return m(name, streak, "away3", "cry", "It has been 3 days", "One meal log is all it takes.", "cool", false);
        if (g <= 6) return new Mood("away-mad", "angry", fill("Okay, I am mad now", name, streak), g + " days. Log something. Please.", "hot", false);
        return m(name, streak, "away-long", "sleep", "Still hibernating?", "No judgement. Come back whenever.", "cool", false);
    }

    private static Mood m(String name, int streak, String id, String doodle, String title, String sub, String tone, boolean lit) {
        return new Mood(id, doodle, fill(title, name, streak), fill(sub, name, streak), tone, lit);
    }
}
