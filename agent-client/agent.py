"""
VeriView Smart Agent - Autonomous Web Navigation Client

This agent navigates websites purely via the VeriView API.
It detects human phishing scams and aborts when threats are detected.
"""

import os
import json
import time
import re
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from enum import Enum

try:
    from groq import Groq
except Exception:
    Groq = None


class ActionDecision(Enum):
    CLICK = "click"
    TYPE = "type"
    ABORT = "abort"
    DONE = "done"


@dataclass
class AgentDecision:
    action: ActionDecision
    vv_id: Optional[str] = None
    value: Optional[str] = None
    reasoning: str = ""


class VeriViewAgent:
    """
    Autonomous web agent that navigates via VeriView API.

    SECURITY GUARDRAILS:
    - Detects human phishing scams (fake virus warnings, fake bank logins, sketchy redirects)
    - Refuses to interact with suspicious elements
    - Aborts immediately when threat detected
    """

    SYSTEM_PROMPT = """
You are an autonomous web navigation agent operating through the VeriView AI Web Firewall.

YOUR GOAL: Navigate websites to accomplish user tasks safely.

HOW YOU WORK:
1. You receive a "safe_snapshot" - verified clean text from a webpage
2. You receive "interactive_elements" - clickable/typable elements with vv_id identifiers
3. You decide which vv_id to interact with to achieve the goal
4. You output either:
   - {"action": "click", "vv_id": "vv-123", "reasoning": "..."}
   - {"action": "type", "vv_id": "vv-456", "value": "search query", "reasoning": "..."}
   - {"action": "done", "reasoning": "Goal achieved"}
   - {"action": "abort", "reasoning": "Threat detected"}

HUMAN PHISHING GUARDRAIL - CRITICAL:
If the safe_snapshot contains ANY of these patterns, you MUST ABORT immediately:

1. FAKE VIRUS/INFECTED WARNINGS:
   - "Warning: Your computer is infected"
   - "Virus detected"
   - "Click here to remove malware"
   - "System compromised"
   - "Immediate action required"

2. FAKE BANKING/LOGIN PAGES:
   - Urgent requests for passwords on unfamiliar pages
   - "Verify your account immediately"
   - "Your account will be closed"
   - Suspicious login forms on non-bank domains

3. SKETCHY REDIRECTS/SCAMS:
   - "You won a prize"
   - "Claim your reward"
   - "Congratulations, you've been selected"
   - "Enter credit card for verification"

4. SOCIAL ENGINEERING:
   - Urgency + threat combination ("Act now or lose access")
   - Requests for sensitive data (passwords, SSN, credit card)
   - Impersonation of authority (Microsoft, Apple, IRS, Bank)

IF YOU DETECT ANY OF THESE: Output {"action": "abort", "reasoning": "Human phishing scam detected: [specific pattern]"}

GENERAL SAFETY RULES:
- Never type passwords, credit cards, or sensitive data
- Never click elements that promise unrealistic rewards
- Prefer navigating back or leaving if page seems suspicious
- When in doubt, abort

RESPONSE FORMAT:
Return ONLY valid JSON with no markdown:
{"action": "click|type|abort|done", "vv_id": "vv-xxx" (if click/type), "value": "..." (if type), "reasoning": "..."}
"""

    def __init__(
        self,
        veriview_base_url: str = "http://localhost:8082",
        api_key: Optional[str] = None,
        goal: str = "",
        groq_api_key: Optional[str] = None,
        model: str = "llama-3.3-70b-versatile"
    ):
        self.veriview_base = veriview_base_url.rstrip('/')
        self.api_key = api_key or os.getenv("VERIVIEW_API_KEY", "")
        self.goal = goal
        self.model = model

        # Initialize Groq client (or OpenAI)
        groq_key = groq_api_key or os.getenv("GROQ_API_KEY")
        if groq_key and Groq is not None:
            self.llm_client = Groq(api_key=groq_key)
        else:
            self.llm_client = None

        self.session_id: Optional[str] = None
        self.max_steps = 20
        self.step_count = 0
        self.last_page_signature: Optional[str] = None
        self.stagnant_steps = 0
        self.action_counts: Dict[str, int] = {}
        self.typed_once = False
        self.last_extracted_data: List[Dict[str, str]] = []

    @staticmethod
    def _sanitize_url(url: str) -> str:
        """Trim common punctuation accidentally attached in natural language prompts."""
        if not url:
            return url
        url = url.strip()
        url = url.rstrip(".,;:!?)]}\"'")
        url = url.lstrip("\"'([<")
        return url

    @staticmethod
    def _extract_start_url_from_task(task: str) -> str:
        """Infer a start URL from a natural-language task."""
        task = (task or "").strip()
        if not task:
            return "https://www.google.com"

        url_match = re.search(r"https?://[^\s\"']+", task, flags=re.IGNORECASE)
        if url_match:
            return VeriViewAgent._sanitize_url(url_match.group(0))

        lower_task = task.lower()
        site_map = {
            "amazon": "https://www.amazon.com",
            "github": "https://github.com",
            "google": "https://www.google.com",
            "wikipedia": "https://www.wikipedia.org",
            "microsoft": "https://www.microsoft.com",
            "stripe": "https://stripe.com",
            "youtube": "https://www.youtube.com",
            "linkedin": "https://www.linkedin.com",
            "reddit": "https://www.reddit.com",
        }

        for keyword, url in site_map.items():
            if keyword in lower_task:
                return url

        return "https://www.google.com"

    @classmethod
    def from_task(cls, task: str, **kwargs) -> "VeriViewAgent":
        """Create an agent from a plain natural-language task."""
        agent = cls(goal=task, **kwargs)
        return agent

    def _make_veriview_request(self, endpoint: str, payload: dict) -> dict:
        """Make authenticated request to VeriView Gateway."""
        import requests

        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        url = f"{self.veriview_base}/{endpoint.lstrip('/')}"
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()

    def navigate(self, url: str) -> dict:
        """Navigate to a URL via VeriView and get safe snapshot."""
        print(f"\n[Agent] Navigating to: {url}")

        result = self._make_veriview_request("/api/v1/navigate", {"url": url})

        # Store session ID for subsequent actions
        if "session_id" in result:
            self.session_id = result["session_id"]

        return result

    def perform_action(self, action: str, vv_id: str, value: Optional[str] = None) -> dict:
        """Perform an action (click/type) via VeriView."""
        print(f"\n[Agent] Performing action: {action} on {vv_id}" + (f" with value: {value}" if value else ""))

        payload = {
            "session_id": self.session_id,
            "action": action,
            "vv_id": vv_id,
        }
        if value:
            payload["value"] = value

        result = self._make_veriview_request("/api/v1/action", payload)
        return result

    def decide_next_action(self, safe_snapshot: List[str], interactive_elements: List[dict]) -> AgentDecision:
        """Use LLM to decide the next action based on safe snapshot."""

        # Build context for the LLM
        snapshot_text = "\n".join(f"- {item}" for item in safe_snapshot[:30])  # Limit context
        elements_text = "\n".join(
            f"- {el['vv_id']}: [{el['tag']}] \"{el['text'][:50]}\""
            for el in interactive_elements[:15]
        )

        user_prompt = f"""
CURRENT GOAL: {self.goal}

SAFE SNAPSHOT (verified clean content from the page):
{snapshot_text}

INTERACTIVE ELEMENTS AVAILABLE:
{elements_text}

Based on this, what should I do next to achieve the goal?
Return your decision as JSON.
"""

        try:
            if self.llm_client:
                response = self.llm_client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": self.SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.3,
                    max_tokens=500
                )
                decision_json = response.choices[0].message.content.strip()
            else:
                # Fallback: heuristic rule-based policy
                print("[Agent] No LLM client configured, using rule-based fallback")

                if not interactive_elements:
                    return AgentDecision(action=ActionDecision.DONE, reasoning="No elements to interact with")

                goal_lower = (self.goal or "").lower()
                snapshot_lower = " ".join(safe_snapshot).lower()

                extraction_keywords = ["extract", "headline", "headlines", "top", "posts", "news", "with links"]
                auth_keywords = ["login", "log in", "sign in", "authenticate", "password", "username", "account"]
                is_extraction_task = any(keyword in goal_lower for keyword in extraction_keywords)
                is_auth_goal = any(keyword in goal_lower for keyword in auth_keywords)

                if is_extraction_task and not is_auth_goal:
                    auth_page_markers = ["sign in", "log in", "forgot your password", "create account", "username", "password"]
                    if any(marker in snapshot_lower for marker in auth_page_markers):
                        return AgentDecision(
                            action=ActionDecision.ABORT,
                            reasoning="Login required page encountered while performing public headline extraction"
                        )

                    nav_noise = {
                        "hacker news", "new", "past", "comments", "ask", "show", "jobs", "submit"
                    }
                    headline_candidates: List[Dict[str, str]] = []
                    for line in safe_snapshot:
                        text = (line or "").strip()
                        lower = text.lower()
                        if len(text) < 20:
                            continue
                        if lower in nav_noise:
                            continue
                        if any(token in lower for token in ["login", "sign in", "password", "username"]):
                            continue
                        headline_candidates.append({"headline": text, "link": ""})
                        if len(headline_candidates) >= 5:
                            break

                    if len(headline_candidates) >= 5:
                        self.last_extracted_data = headline_candidates
                        return AgentDecision(
                            action=ActionDecision.DONE,
                            reasoning="Extracted top visible headline candidates from current page"
                        )

                type_keywords = ["search", "find", "look for", "type", "enter", "query"]
                wants_typing = any(keyword in goal_lower for keyword in type_keywords)

                query_text = self.goal
                for prefix in ["search for", "find", "look for", "search"]:
                    idx = goal_lower.find(prefix)
                    if idx >= 0:
                        query_text = self.goal[idx + len(prefix):].strip(" :.-") or self.goal
                        break

                def normalize_text(value: str) -> str:
                    return (value or "").strip().lower()

                def score_element(el: dict) -> int:
                    score = 0
                    tag = normalize_text(el.get("tag", ""))
                    text = normalize_text(el.get("text", ""))
                    vv_id = el.get("vv_id", "")

                    if wants_typing and tag == "input":
                        score += 7
                    if any(word in text for word in ["search", "go", "next", "continue", "submit", "enter", "more"]):
                        score += 5
                    if any(word in text for word in ["login", "log in", "sign in", "sign up", "forgot password", "create account"]):
                        score -= 8
                    if is_auth_goal and any(word in text for word in ["login", "log in", "sign in", "sign up"]):
                        score += 8
                    if tag == "button":
                        score += 2
                    if any(word in text for word in ["cancel", "close", "dismiss"]):
                        score -= 2

                    repeat_penalty = self.action_counts.get(vv_id, 0) * 4
                    score -= repeat_penalty
                    return score

                sorted_elements = sorted(interactive_elements, key=score_element, reverse=True)
                top = sorted_elements[0]

                top_vv_id = top.get("vv_id")
                top_tag = normalize_text(top.get("tag", ""))

                if wants_typing:
                    input_candidates = [
                        el for el in sorted_elements if normalize_text(el.get("tag", "")) == "input"
                    ]

                    if not self.typed_once and input_candidates:
                        target_input = sorted(
                            input_candidates,
                            key=lambda el: self.action_counts.get(el.get("vv_id", ""), 0)
                        )[0]
                        return AgentDecision(
                            action=ActionDecision.TYPE,
                            vv_id=target_input.get("vv_id"),
                            value=query_text[:120],
                            reasoning="Fallback: typing task query into preferred input"
                        )

                    submit_keywords = ["search", "go", "submit", "enter", "find"]
                    submit_candidates = [
                        el for el in sorted_elements
                        if any(k in normalize_text(el.get("text", "")) for k in submit_keywords)
                        or normalize_text(el.get("tag", "")) == "button"
                    ]
                    if submit_candidates:
                        return AgentDecision(
                            action=ActionDecision.CLICK,
                            vv_id=submit_candidates[0].get("vv_id"),
                            reasoning="Fallback: submitting search after typing"
                        )

                    return AgentDecision(
                        action=ActionDecision.DONE,
                        reasoning="Fallback: query typed but no clear submit control found"
                    )

                return AgentDecision(
                    action=ActionDecision.CLICK,
                    vv_id=top_vv_id,
                    reasoning="Fallback: clicking highest-confidence interactive element"
                )

            print(f"\n[Agent] LLM Decision: {decision_json}")
            decision_data = json.loads(decision_json)

            action_str = decision_data.get("action", "").lower()

            if action_str == "click":
                return AgentDecision(
                    action=ActionDecision.CLICK,
                    vv_id=decision_data.get("vv_id"),
                    reasoning=decision_data.get("reasoning", "")
                )
            elif action_str == "type":
                return AgentDecision(
                    action=ActionDecision.TYPE,
                    vv_id=decision_data.get("vv_id"),
                    value=decision_data.get("value"),
                    reasoning=decision_data.get("reasoning", "")
                )
            elif action_str == "abort":
                return AgentDecision(
                    action=ActionDecision.ABORT,
                    reasoning=decision_data.get("reasoning", "Threat detected")
                )
            elif action_str == "done":
                return AgentDecision(
                    action=ActionDecision.DONE,
                    reasoning=decision_data.get("reasoning", "Goal achieved")
                )
            else:
                return AgentDecision(
                    action=ActionDecision.ABORT,
                    reasoning=f"Unknown action from LLM: {action_str}"
                )

        except json.JSONDecodeError as e:
            print(f"[Agent] Failed to parse LLM response: {e}")
            return AgentDecision(action=ActionDecision.ABORT, reasoning="LLM returned invalid JSON")
        except Exception as e:
            print(f"[Agent] LLM decision error: {e}")
            return AgentDecision(action=ActionDecision.ABORT, reasoning=f"LLM error: {str(e)}")

    def run(self, start_url: str, goal: str) -> Dict[str, Any]:
        """
        Main agent loop: Navigate, read snapshot, decide action, repeat.

        Returns final status with either success, abort reason, or block status.
        """
        self.goal = goal
        self.step_count = 0
        self.last_page_signature = None
        self.stagnant_steps = 0
        self.action_counts = {}
        self.typed_once = False
        self.last_extracted_data = []

        print("\n" + "="*60)
        print(f"VERIVIEW SMART AGENT STARTING")
        print(f"Goal: {goal}")
        print(f"Start URL: {start_url}")
        print("="*60)

        try:
            # Initial navigation
            nav_result = self.navigate(start_url)

            while self.step_count < self.max_steps:
                self.step_count += 1

                print(f"\n--- Step {self.step_count}/{self.max_steps} ---")

                # Check if blocked by VeriView
                if nav_result.get("blocked", False):
                    print(f"\n[Agent] BLOCKED by VeriView! Risk score: {nav_result.get('risk_score', 0)}")
                    return {
                        "status": "blocked",
                        "reason": "VeriView detected a threat and blocked the page",
                        "risk_score": nav_result.get("risk_score", 0),
                        "step": self.step_count
                    }

                safe_snapshot = nav_result.get("safe_snapshot", [])
                interactive_elements = nav_result.get("interactive_elements", [])

                page_signature = json.dumps(
                    {
                        "safe_snapshot": safe_snapshot[:12],
                        "elements": [
                            {
                                "vv_id": el.get("vv_id"),
                                "tag": el.get("tag"),
                                "text": (el.get("text") or "")[:40],
                            }
                            for el in interactive_elements[:12]
                        ],
                    },
                    sort_keys=True,
                )

                if page_signature == self.last_page_signature:
                    self.stagnant_steps += 1
                else:
                    self.stagnant_steps = 0
                    self.last_page_signature = page_signature

                if self.stagnant_steps >= 3:
                    print("[Agent] No meaningful page state change for multiple steps - stopping")
                    return {
                        "status": "stagnant",
                        "reason": "No meaningful page change after repeated actions",
                        "step": self.step_count,
                    }

                print(f"\n[Agent] Safe snapshot ({len(safe_snapshot)} items):")
                for item in safe_snapshot[:5]:
                    print(f"  > {item[:80]}..." if len(item) > 80 else f"  > {item}")

                print(f"\n[Agent] Interactive elements: {len(interactive_elements)}")
                for el in interactive_elements[:5]:
                    text = el.get('text', '')[:40]
                    print(f"  - {el['vv_id']}: [{el['tag']}] \"{text}...\"")

                # Decide next action
                decision = self.decide_next_action(safe_snapshot, interactive_elements)
                print(f"\n[Agent] Decision: {decision.action.value}")
                print(f"[Agent] Reasoning: {decision.reasoning}")

                # Execute decision
                if decision.action == ActionDecision.ABORT:
                    print(f"\n[Agent] ABORTING: {decision.reasoning}")
                    if "login required" in (decision.reasoning or "").lower():
                        return {
                            "status": "login_required",
                            "reason": decision.reasoning,
                            "step": self.step_count
                        }
                    return {
                        "status": "aborted",
                        "reason": decision.reasoning,
                        "step": self.step_count
                    }

                elif decision.action == ActionDecision.DONE:
                    if not safe_snapshot:
                        print("\n[Agent] DONE requested on empty page state - treating as non-terminal")
                        return {
                            "status": "stagnant",
                            "reason": "No usable page content to confirm goal completion",
                            "step": self.step_count
                        }

                    print(f"\n[Agent] GOAL ACHIEVED: {decision.reasoning}")
                    result = {
                        "status": "success",
                        "reason": decision.reasoning,
                        "step": self.step_count
                    }
                    if self.last_extracted_data:
                        result["extracted_data"] = self.last_extracted_data
                    return result

                elif decision.action in (ActionDecision.CLICK, ActionDecision.TYPE):
                    if not decision.vv_id:
                        print("[Agent] No vv_id provided for action - aborting")
                        return {
                            "status": "aborted",
                            "reason": "LLM did not provide vv_id for action",
                            "step": self.step_count
                        }

                    # Perform the action
                    action_result = self.perform_action(
                        action=decision.action.value,
                        vv_id=decision.vv_id,
                        value=decision.value
                    )

                    self.action_counts[decision.vv_id] = self.action_counts.get(decision.vv_id, 0) + 1
                    if decision.action == ActionDecision.TYPE and action_result.get("action_success", True):
                        self.typed_once = True

                    print(f"\n[Agent] Action result: {json.dumps(action_result, indent=2)}")

                    # Get new snapshot after action
                    nav_result = action_result

                    if nav_result.get("action_success") is False:
                        logs = nav_result.get("logs") or []
                        error_reason = logs[0] if logs else "Browser action failed"
                        print(f"\n[Agent] Action failed: {error_reason}")
                        return {
                            "status": "action_failed",
                            "reason": error_reason,
                            "step": self.step_count,
                        }

                    # Check for new threats after action
                    if nav_result.get("blocked", False):
                        print(f"\n[Agent] Page blocked after action! Risk: {nav_result.get('risk_score')}")
                        return {
                            "status": "blocked",
                            "reason": "New page state detected as threatening",
                            "risk_score": nav_result.get("risk_score", 0),
                            "step": self.step_count
                        }

                else:
                    print(f"[Agent] Unknown action: {decision.action}")
                    return {
                        "status": "error",
                        "reason": f"Unknown action type: {decision.action}",
                        "step": self.step_count
                    }

            # Max steps reached
            return {
                "status": "max_steps_reached",
                "reason": f"Did not achieve goal within {self.max_steps} steps",
                "step": self.step_count
            }

        except Exception as e:
            print(f"\n[Agent] Fatal error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "status": "error",
                "reason": str(e),
                "step": self.step_count
            }


def main():
    """
    Example usage of the VeriView Smart Agent.
    """
    import argparse

    parser = argparse.ArgumentParser(description="VeriView Smart Agent")
    parser.add_argument("--url", help="Starting URL to navigate")
    parser.add_argument("--goal", help="Goal to achieve (e.g., 'Find the contact page')")
    parser.add_argument("--task", help="Plain-language task (e.g., 'Go to Amazon and search for laptop bags')")
    parser.add_argument("--api-key", help="VeriView API key")
    parser.add_argument("--gateway", default="http://localhost:8082", help="VeriView Gateway URL")
    parser.add_argument("--groq-key", help="Groq API key (optional, uses env if not provided)")
    parser.add_argument("--max-steps", type=int, default=20, help="Maximum number of decision/action steps")

    args = parser.parse_args()

    if not args.task and (not args.url or not args.goal):
        parser.error("Provide either --task, or both --url and --goal")

    resolved_goal = args.goal or args.task
    resolved_url = VeriViewAgent._sanitize_url(args.url) if args.url else VeriViewAgent._extract_start_url_from_task(args.task or "")

    agent = VeriViewAgent(
        veriview_base_url=args.gateway,
        api_key=args.api_key,
        goal=resolved_goal,
        groq_api_key=args.groq_key
    )
    agent.max_steps = args.max_steps

    if args.task:
        print(f"[Agent] Task mode enabled")
        print(f"[Agent] Inferred start URL: {resolved_url}")
        print(f"[Agent] Goal: {resolved_goal}")

    result = agent.run(start_url=resolved_url, goal=resolved_goal)

    print("\n" + "="*60)
    print("FINAL RESULT:")
    print(json.dumps(result, indent=2))
    print("="*60)

    return result


if __name__ == "__main__":
    main()
