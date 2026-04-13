import { NextRequest, NextResponse } from "next/server";

// In-memory store for demo
type Collection = {
  id: string;
  name: string;
  emoji: string;
  isDefault: boolean;
  bookmarks: string[]; // post shortcodes
};

type VisitorData = {
  email: string;
  name: string | null;
  collections: Collection[];
};

const visitors = new Map<string, VisitorData>();

function getOrCreateVisitor(siteId: string, email: string, name?: string): VisitorData {
  const key = `${siteId}:${email}`;
  if (!visitors.has(key)) {
    visitors.set(key, {
      email,
      name: name || null,
      collections: [
        { id: `col-${Date.now()}`, name: "Saved", emoji: "", isDefault: true, bookmarks: [] },
      ],
    });
  }
  return visitors.get(key)!;
}

// GET /api/bookmarks?siteId=xxx&email=xxx — Get visitor's collections and bookmarks
export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get("siteId");
  const email = request.nextUrl.searchParams.get("email");

  if (!siteId || !email) {
    return NextResponse.json({ error: "Missing siteId or email" }, { status: 400 });
  }

  const key = `${siteId}:${email}`;
  const visitor = visitors.get(key);

  if (!visitor) {
    return NextResponse.json({ collections: [], authenticated: false });
  }

  return NextResponse.json({ collections: visitor.collections, authenticated: true });
}

// POST /api/bookmarks — Sign in + bookmark a post, or create a collection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, email, name, action } = body;

    if (!siteId || !email) {
      return NextResponse.json({ error: "Missing siteId or email" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const visitor = getOrCreateVisitor(siteId, email, name);

    if (action === "bookmark") {
      const { postShortcode, collectionId } = body;
      if (!postShortcode) {
        return NextResponse.json({ error: "Missing postShortcode" }, { status: 400 });
      }

      // Find collection (default if not specified)
      const collection = collectionId
        ? visitor.collections.find((c) => c.id === collectionId)
        : visitor.collections.find((c) => c.isDefault);

      if (!collection) {
        return NextResponse.json({ error: "Collection not found" }, { status: 404 });
      }

      // Toggle bookmark
      const idx = collection.bookmarks.indexOf(postShortcode);
      if (idx >= 0) {
        collection.bookmarks.splice(idx, 1);
        return NextResponse.json({ bookmarked: false, collection: collection.id });
      } else {
        collection.bookmarks.push(postShortcode);
        return NextResponse.json({ bookmarked: true, collection: collection.id });
      }
    }

    if (action === "create_collection") {
      const { collectionName, emoji } = body;
      if (!collectionName?.trim()) {
        return NextResponse.json({ error: "Missing collection name" }, { status: 400 });
      }

      const newCollection: Collection = {
        id: `col-${Date.now()}`,
        name: collectionName.trim(),
        emoji: emoji || "",
        isDefault: false,
        bookmarks: [],
      };
      visitor.collections.push(newCollection);
      return NextResponse.json({ collection: newCollection }, { status: 201 });
    }

    if (action === "move_bookmark") {
      const { postShortcode, fromCollectionId, toCollectionId } = body;
      const from = visitor.collections.find((c) => c.id === fromCollectionId);
      const to = visitor.collections.find((c) => c.id === toCollectionId);
      if (!from || !to) {
        return NextResponse.json({ error: "Collection not found" }, { status: 404 });
      }
      from.bookmarks = from.bookmarks.filter((b) => b !== postShortcode);
      if (!to.bookmarks.includes(postShortcode)) {
        to.bookmarks.push(postShortcode);
      }
      return NextResponse.json({ moved: true });
    }

    // Default: just sign in / return profile
    return NextResponse.json({
      authenticated: true,
      collections: visitor.collections,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE /api/bookmarks — Remove a collection
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, email, collectionId } = body;

    if (!siteId || !email || !collectionId) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const key = `${siteId}:${email}`;
    const visitor = visitors.get(key);
    if (!visitor) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    visitor.collections = visitor.collections.filter(
      (c) => c.id !== collectionId || c.isDefault,
    );

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
