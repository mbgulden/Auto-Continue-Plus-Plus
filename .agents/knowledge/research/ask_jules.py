import urllib.request
import json
import urllib.error

api_key = "AIzaSyDsAuvi_omJmk6vqk7aYYrghwIHC2ccjGw"
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={api_key}"

prompt = """
You are Jules, a proactive coding agent by Google. You have deep knowledge of the open-source GitHub landscape, Google Antigravity ecosystem, and Agentic Swarm Orchestration.
The user is building 'Auto-Continue Plus Plus', an agentic VS Code extension that orchestrates Swarms of AI agents.
They need a comprehensive, strategic research report on the following:

1. What does the open-source world and your analysis say about 'OpenClaw'? What are its drawbacks, problems, and where are people wasting money and time?
2. What opportunities, potential solutions, and directions should Auto-Continue Plus Plus take to become truly useful, agentic, and superior to OpenClaw?
3. Should they piggyback off OpenClaw, or lean heavily into the Google Antigravity/VS Code environment with modular 'bolt-on' addons?
4. How can they make 'Auto-Continue Plus Plus' a tool that people actually use in production environments safely and consistently?

Draft a comprehensive research report addressing these points, outlining plans for creating a system of that magnitude, formatted beautifully in Markdown. Be highly critical of OpenClaw's loose operating model and highly supportive of strongly-typed, verification-driven Auto-Continue Plus Plus swarms.
"""

data = {
    "contents": [{"parts": [{"text": prompt}]}],
    "systemInstruction": {
        "parts": [{"text": "You are Jules, a highly analytical and proactive coding agent by Google. Deliver your output in clean Markdown."}]
    }
}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})

try:
    print("Calling Gemini API...")
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        text = result['candidates'][0]['content']['parts'][0]['text']
        
        output_path = r"c:\Users\mbgul\Dropbox\Workshop\Auto-Continue Plus Plus\.agents\knowledge\research\jules_analysis.md"
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(text)
        print("Successfully generated and saved Jules' analysis to: " + output_path)
except urllib.error.HTTPError as e:
    err_body = e.read().decode('utf-8')
    print(f"HTTP Error: {e.code}")
    with open("error.json", "w") as f:
        f.write(err_body)
    print("Wrote error to error.json")
except Exception as e:
    print(f"Error calling API: {e}")
