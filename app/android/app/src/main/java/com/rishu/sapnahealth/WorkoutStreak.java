package com.rishu.sapnahealth;

import java.util.Set;

/**
 * Workout-only streak for the widget. Pure Java with civil-date maths (no java.time: minSdk 24).
 * KEEP IN SYNC with src/lib/workoutStreak.ts — a parity test compares both.
 */
final class WorkoutStreak {
    static final class State {
        int streak;
        boolean doneToday, gymToday, comeback;
        Integer missed; // null = never worked out
    }

    /** days since 1970-01-01 for "YYYY-MM-DD" (Howard Hinnant's days_from_civil) */
    static long epochDay(String k) {
        int y = Integer.parseInt(k.substring(0, 4));
        int m = Integer.parseInt(k.substring(5, 7));
        int d = Integer.parseInt(k.substring(8, 10));
        y -= m <= 2 ? 1 : 0;
        long era = (y >= 0 ? y : y - 399) / 400;
        long yoe = y - era * 400;
        long doy = (153L * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    /** 0 = Sunday … 6 = Saturday */
    static int dow(long epochDay) {
        return (int) Math.floorMod(epochDay + 4, 7L);
    }

    private static boolean isGym(long day, int[] gym) {
        if (gym.length == 0) return true;
        int w = dow(day);
        for (int g : gym) if (g == w) return true;
        return false;
    }

    private static int missedBetween(long from, long to, int[] gym) {
        int n = 0;
        for (long k = from + 1, i = 0; k < to && i < 400; k++, i++) if (isGym(k, gym)) n++;
        return n;
    }

    static State state(Set<Long> days, int[] gym, long today) {
        State s = new State();
        int streak = 0;
        for (long k = today, i = 0; i < 400; k--, i++) {
            if (days.contains(k)) streak++;
            else if (k != today && isGym(k, gym)) break;
        }
        s.streak = streak;
        s.doneToday = days.contains(today);
        Long lastBefore = null;
        for (Long d : days) if (d < today && (lastBefore == null || d > lastBefore)) lastBefore = d;
        s.missed = s.doneToday ? Integer.valueOf(0) : lastBefore == null ? null : Integer.valueOf(missedBetween(lastBefore, today, gym));
        s.comeback = s.doneToday && lastBefore != null && missedBetween(lastBefore, today, gym) >= 1;
        s.gymToday = isGym(today, gym);
        return s;
    }

    private static String milestone(int n) {
        switch (n) {
            case 3: return "a habit forming";
            case 5: return "five in a row";
            case 10: return "double digits";
            case 20: return "twenty strong";
            case 30: return "thirty strong";
            case 50: case 75: return "unstoppable";
            case 100: return "a legend";
            default: return (n > 0 && n % 50 == 0) ? "a legend" : null;
        }
    }

    static MoodEngine.Mood mood(State st, String name, int hour, int dayIndex) {
        int n = st.streak;
        if (st.missed == null && !st.doneToday) return m(name, n, "w-fresh", "cap", "First workout loading", "Hit the gym once, {name}. That is day one.", "warm", false);
        if (st.doneToday) {
            if (st.comeback) return m(name, n, "w-comeback", "love", "Welcome back!", "Back in the gym. We go again.", "warm", true);
            String ms = milestone(n);
            if (ms != null) return m(name, n, "w-milestone", "celebrate", "{n} workouts strong!", "{name}, that is " + ms + ".", "warm", true);
            if (hour >= 21) return m(name, n, "w-night", "sleep", "Rest those muscles", "Workout {n} done. Sleep well.", "cool", true);
            if (n >= 10) return m(name, n, "w-locked", "flex", "Locked in", "{n} workouts in a row.", "warm", true);
            if (n >= 5) return m(name, n, "w-fire", "fire", "On fire", "{n} workouts. Keep stacking.", "warm", true);
            return Math.floorMod(dayIndex, 2) == 0
                ? m(name, n, "w-done-a", "cheer", "Workout done!", "That is {n} in a row.", "warm", true)
                : m(name, n, "w-done-b", "thumbs", "Nailed it", "Workout {n} in the bag.", "warm", true);
        }
        if (n > 0) {
            if (!st.gymToday) return m(name, n, "w-rest", "love", "Rest day", "Recover well. Your streak is safe.", "cool", true);
            if (hour < 11) return m(name, n, "w-morning", "cap", "Gym day!", "Your {n}-workout streak is waiting.", "warm", true);
            if (hour < 16) return m(name, n, "w-midday", "plan", "Plan your gym slot", "Keep the {n}-workout streak going.", "warm", true);
            if (hour < 20) return m(name, n, "w-evening", "point", "Hey {name}...", "Do not skip the gym today.", "hot", true);
            return m(name, n, "w-late", "shocked", n >= 5 ? "Do not lose {n} workouts!" : "Still time for the gym!", "A quick session saves the streak.", "hot", true);
        }
        int g = st.missed == null ? 1 : st.missed;
        if (g <= 1) return m(name, n, "w-missed", "sad", "You missed a gym day", "Streak reset. Next session starts it again.", "cool", false);
        if (g == 2) return m(name, n, "w-missed2", "cry", "Two gym days missed", "One workout fixes everything.", "cool", false);
        if (g <= 5) return new MoodEngine.Mood("w-mad", "angry", fill("Okay, I am mad now", name, n), g + " gym days skipped. Go.", "hot", false);
        return m(name, n, "w-long", "sleep", "Still hibernating?", "The gym misses you. No judgement.", "cool", false);
    }

    private static String fill(String s, String name, int n) {
        return s.replace("{name}", name).replace("{n}", String.valueOf(n));
    }

    private static MoodEngine.Mood m(String name, int n, String id, String doodle, String title, String sub, String tone, boolean lit) {
        return new MoodEngine.Mood(id, doodle, fill(title, name, n), fill(sub, name, n), tone, lit);
    }
}
