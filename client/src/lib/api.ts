const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

export async function getReadiness(signal: AbortSignal): Promise<string> {
  const timeout = AbortSignal.timeout(8000);
  const requestSignal = AbortSignal.any([signal, timeout]);
  try {
    const [hello, health] = await Promise.all([
      fetch(`${apiUrl}/hello`, { signal: requestSignal }),
      fetch(`${apiUrl}/health`, { signal: requestSignal }),
    ]);
    if (!hello.ok) throw new Error("The API returned an error. Check the server terminal.");
    if (!health.ok) throw new Error("The API is reachable, but MongoDB is unavailable. Check the database connection.");
    const data: unknown = await hello.json();
    if (!data || typeof data !== "object" || !("message" in data) || typeof data.message !== "string") {
      throw new Error("The API returned an unexpected response.");
    }
    return `${data.message} MongoDB is connected.`;
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.aborted) throw new Error("Connection check timed out. Check the API and try again.");
    if (error instanceof TypeError) throw new Error("Cannot reach the API. Start the server and check NEXT_PUBLIC_API_URL and CLIENT_ORIGIN.");
    throw error;
  }
}
