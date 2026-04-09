import { useState } from "react";
import { updateOnboarding } from "../api/profileApi";
import {
  PROFILE_HELP_TOPIC_OPTIONS,
  PROFILE_YEAR_OPTIONS,
  TAG_CATEGORIES,
} from "../data";
import type { UserProfile } from "../types";

interface Props {
  onComplete: (profile: UserProfile) => void;
}

type Step = 1 | 2 | 3;

const ALL_TAGS = TAG_CATEGORIES.flatMap((c) => c.tags);

export default function OnboardingFlow({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pastChallenge, setPastChallenge] = useState("");
  const [helpTopics, setHelpTopics] = useState<string[]>([]);
  const [comfortLevel, setComfortLevel] = useState("open to messages");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleItem<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((v) => v !== item) : [...list, item];
  }

  const canAdvanceStep1 = major.trim().length >= 2 && year !== "";
  const canAdvanceStep2 = selectedTags.length > 0 && pastChallenge.trim().length >= 20;
  const canFinish = helpTopics.length > 0;

  async function handleFinish() {
    if (!canFinish) return;
    setSaving(true);
    setError("");
    try {
      const result = await updateOnboarding({
        major: major.trim(),
        year: year.trim(),
        tags: selectedTags,
        past_challenge: pastChallenge.trim(),
        help_topics: helpTopics,
        comfort_level: comfortLevel,
      });
      if (result.profile) {
        onComplete(result.profile);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#041a30]/82 px-4 py-6 backdrop-blur-sm md:py-10">
      <div className="mx-auto w-full max-w-2xl rounded-[32px] border border-maize/15 bg-[#081f39] p-6 shadow-2xl md:p-8">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-[#FFCB05]" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Step 1 — Basic info */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-white">Tell us about yourself</h1>
              <p className="mt-1 text-sm text-white/50">This helps us find peers who understand your situation.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">What's your major?</label>
                <input
                  type="text"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  placeholder="e.g. Computer Science"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/25 focus:border-[#FFCB05]/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">What year are you?</label>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#FFCB05]/50 focus:outline-none"
                >
                  <option value="" disabled className="bg-[#081f39]">Select year</option>
                  {PROFILE_YEAR_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} className="bg-[#081f39]">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              disabled={!canAdvanceStep1}
              onClick={() => setStep(2)}
              className="w-full rounded-lg bg-[#FFCB05] py-3 font-semibold text-[#0a0a0f] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2 — Past challenges */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-white">What have you been through?</h1>
              <p className="mt-1 text-sm text-white/50">These experiences help other students find you. Select all that apply.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-2">Pick relevant tags</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTags((prev) => toggleItem(prev, tag))}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        selectedTags.includes(tag)
                          ? "border-[#FFCB05] bg-[#FFCB05]/10 text-[#FFCB05]"
                          : "border-white/15 text-white/50 hover:border-white/30"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Describe it in your own words</label>
                <textarea
                  value={pastChallenge}
                  onChange={(e) => setPastChallenge(e.target.value)}
                  rows={4}
                  placeholder="Tell us what was happening. Be as specific or as vague as you're comfortable with."
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-[#FFCB05]/50 focus:outline-none resize-none"
                />
                <p className="mt-1 text-xs text-white/30">{pastChallenge.trim().length} / 2000 chars · min 20</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 rounded-lg border border-white/10 py-3 text-sm text-white/60 hover:border-white/20">Back</button>
              <button
                disabled={!canAdvanceStep2}
                onClick={() => setStep(3)}
                className="flex-[2] rounded-lg bg-[#FFCB05] py-3 font-semibold text-[#0a0a0f] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Help topics */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-white">Who do you want to help?</h1>
              <p className="mt-1 text-sm text-white/50">Select topics where you could offer support or a listening ear.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-2">Help topics</label>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                  {PROFILE_HELP_TOPIC_OPTIONS.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => setHelpTopics((prev) => toggleItem(prev, topic))}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        helpTopics.includes(topic)
                          ? "border-[#FFCB05] bg-[#FFCB05]/10 text-[#FFCB05]"
                          : "border-white/15 text-white/50 hover:border-white/30"
                      }`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-1">Comfort with messages</label>
                <select
                  value={comfortLevel}
                  onChange={(e) => setComfortLevel(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#FFCB05]/50 focus:outline-none"
                >
                  <option value="open to messages" className="bg-[#081f39]">Open to messages</option>
                  <option value="prefers intro message" className="bg-[#081f39]">Prefers a scheduled chat</option>
                </select>
              </div>
            </div>
            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 rounded-lg border border-white/10 py-3 text-sm text-white/60 hover:border-white/20">Back</button>
              <button
                disabled={!canFinish || saving}
                onClick={handleFinish}
                className="flex-[2] rounded-lg bg-[#FFCB05] py-3 font-semibold text-[#0a0a0f] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Get started"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
