import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"

// Server-only: read the Google access token from the encrypted JWT.
// Never expose this to the client.
export const getAccessToken = async (request: NextRequest): Promise<string | null> => {
  try {
    const token = await getToken({ req: request as any })
    return (token?.accessToken as string) || null
  } catch {
    return null
  }
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope: "openid email profile https://www.googleapis.com/auth/youtube.readonly"
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account }: any) {
      // Initial sign in - save tokens
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600000
        }
      }
      
      // Return token if not expired
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token
      }
      
      // Token expired - refresh it
      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: token.refreshToken as string
          })
        })
        
        const refreshedTokens = await response.json()
        
        if (!response.ok) {
          throw refreshedTokens
        }
        
        return {
          ...token,
          accessToken: refreshedTokens.access_token,
          accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
          refreshToken: refreshedTokens.refresh_token ?? token.refreshToken
        }
      } catch (error) {
        console.error('Error refreshing access token:', error)
        return { ...token, error: 'RefreshAccessTokenError' }
      }
    },
    async session({ session, token }: any) {
      // Do NOT expose the OAuth access token to the client. It stays in the
      // server-side JWT and is read via getToken() in API routes. Only surface
      // the non-sensitive refresh-error status the client needs.
      session.error = token.error as string
      return session
    }
  },
  pages: {
    signIn: '/auth/signin',
    signOut: '/',
    error: '/auth/error'
  }
}
