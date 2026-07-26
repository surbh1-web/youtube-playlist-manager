import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    // accessToken deliberately NOT exposed on the client session — read it
    // server-side via getToken() from the JWT instead.
    error?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    error?: string
  }
}
