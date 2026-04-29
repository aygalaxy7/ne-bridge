document.getElementById("apiBtn").onclick = async () => {
  try {
    const res = await fetch("/api/hello"); // goes to Edge Function → backend
    const text = await res.text();
    document.getElementById("apiResult").textContent = text;
  } catch (err) {
    document.getElementById("apiResult").textContent = "Error: " + err.message;
  }
};
