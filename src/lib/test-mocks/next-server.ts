export class NextResponse extends Response {
  static json(body: any, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    })
  }

  static redirect(url: string | URL, status = 307) {
    return new Response(null, {
      status,
      headers: { Location: typeof url === 'string' ? url : url.toString() },
    })
  }

  static next() {
    return new Response(null)
  }
}

export function after(cb: () => unknown) {
  return cb()
}

export class NextRequest extends Request {
  nextUrl: URL
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init)
    this.nextUrl = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
  }
}

