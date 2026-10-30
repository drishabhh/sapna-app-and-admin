package com.rishu.sapnahealth;

/**
 * What the water widget says and which doodle it shows. Pure Java (no Android types) so it can be unit-tested.
 * `avoid` is the doodle the streak widget shows right now — the water widget never repeats it.
 */
final class WaterMood {
    static final class Mood {
        final String doodle, title, sub, tone;
        Mood(String doodle, String title, String sub, String tone) { this.doodle = doodle; this.title = title; this.sub = sub; this.tone = tone; }
    }

    static String litres(int ml) {
        if (ml < 1000) return ml + " ml";
        int cl = Math.round(ml / 10f);
        String s = String.valueOf(cl / 100.0);
        if (s.endsWith(".0")) s = s.substring(0, s.length() - 2);
        return s + " L";
    }

    /** First candidate that isn't the streak widget's doodle; the first two take turns by day so it doesn't feel static. */
    static String pick(String[] options, String avoid, int dayIndex) {
        int n = options.length;
        int start = Math.floorMod(dayIndex, Math.min(2, n));
        for (int i = 0; i < n; i++) {
            String d = options[(start + i) % n];
            if (!d.equals(avoid)) return d;
        }
        return options[0];
    }

    /** @param minutes minutes since midnight now; from/to = her water hours in minutes */
    static Mood compute(int ml, int goal, String name, int minutes, int from, int to, int dayIndex, String avoid) {
        if (goal <= 0) goal = 2000;
        int left = Math.max(0, goal - ml);
        if (to <= from) to = from + 12 * 60;
        if (ml >= goal) {
            return new Mood(pick(new String[] { "celebrate", "love", "cheeks" }, avoid, dayIndex), "Goal done!", litres(ml) + " today. Hydrated queen.", "warm");
        }
        if (minutes < from) {
            return new Mood(pick(new String[] { "cap", "bottle", "thumbs" }, avoid, dayIndex), "Morning, " + name, "Start the day with a glass of water.", "warm");
        }
        if (minutes >= to) {
            return new Mood(pick(new String[] { "sleep", "sad", "bottle" }, avoid, dayIndex), "Almost bedtime", litres(left) + " left — one last glass?", "cool");
        }
        if (ml == 0) {
            return new Mood(pick(new String[] { "bottle", "point", "confused" }, avoid, dayIndex), "First glass?", litres(goal) + " to drink today.", minutes - from > 180 ? "hot" : "warm");
        }
        int expected = Math.round(goal * (minutes - from) / (float) (to - from));
        if (ml + 250 >= expected) {
            return new Mood(pick(new String[] { "bottle", "thumbs", "cheer" }, avoid, dayIndex), "On track", litres(left) + " to go.", "warm");
        }
        return new Mood(pick(new String[] { "point", "shocked", "confused" }, avoid, dayIndex), "You’re behind, " + name, "Have a glass now — " + litres(left) + " to go.", "hot");
    }
}
