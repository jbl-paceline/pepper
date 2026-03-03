// Pepper - Google OAuth Login
// Visit /api/auth/google/login in browser to start Google auth

export default function handler(req, res) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
