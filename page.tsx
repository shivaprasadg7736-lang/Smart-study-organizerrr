'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const btn = 'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50'
const ghost = 'rounded-lg border px-3 py-1.5 text-sm dark:border-zinc-700'
const inp = 'w-full rounded-lg border bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900'
const card = 'rounded-xl border bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900'
const MAX = 20 * 1024 * 1024, QUOTA = 500 * 1024 * 1024
const mb = (n: number) => (n / 1048576).toFixed(2) + ' MB'
const day = (d: string) => new Date(d).toLocaleDateString()

export default function App() {
  const [user, setUser] = useState<any>(null), [ready, setReady] = useState(false), [rec, setRec] = useState(false)
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setReady(true) })
    const { data } = sb.auth.onAuthStateChange((e, s) => { setUser(s?.user ?? null); if (e === 'PASSWORD_RECOVERY') setRec(true) })
    return () => data.subscription.unsubscribe()
  }, [])
  if (!ready) return null
  if (!user) return <Auth />
  if (rec) return <Reset done={() => setRec(false)} />
  return <Main user={user} />
}

function Auth() {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in'), [email, setE] = useState(''), [pw, setP] = useState(''), [name, setN] = useState(''), [msg, setM] = useState('')
  async function go() {
    setM('')
    const r: any = mode === 'in' ? await sb.auth.signInWithPassword({ email, password: pw })
      : mode === 'up' ? await sb.auth.signUp({ email, password: pw, options: { data: { full_name: name } } })
      : await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin })
    if (r.error) setM(r.error.message)
    else if (mode === 'up' && !r.data?.session) setM('Check your email to confirm your account.')
    else if (mode === 'forgot') setM('Password reset email sent.')
  }
  return <div className="mx-auto mt-16 max-w-sm space-y-3 p-4">
    <h1 className="text-2xl font-semibold">Smart Study Organizer</h1>
    {mode === 'up' && <input className={inp} placeholder="Full name" value={name} onChange={e => setN(e.target.value)} />}
    <input className={inp} type="email" placeholder="Email" value={email} onChange={e => setE(e.target.value)} />
    {mode !== 'forgot' && <input className={inp} type="password" placeholder="Password (min 6)" value={pw} onChange={e => setP(e.target.value)} />}
    <button className={btn + ' w-full'} onClick={go}>{mode === 'in' ? 'Log in' : mode === 'up' ? 'Register' : 'Send reset link'}</button>
    {msg && <p className="text-sm text-indigo-600">{msg}</p>}
    <div className="flex justify-between text-sm text-zinc-500">
      <button onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Create account' : 'Back to login'}</button>
      <button onClick={() => setMode('forgot')}>Forgot password?</button>
    </div></div>
}

function Reset({ done }: { done: () => void }) {
  const [pw, setP] = useState(''), [msg, setM] = useState('')
  return <div className="mx-auto mt-16 max-w-sm space-y-3 p-4">
    <h1 className="text-xl font-semibold">Set a new password</h1>
    <input className={inp} type="password" value={pw} onChange={e => setP(e.target.value)} placeholder="New password" />
    <button className={btn} onClick={async () => { const { error } = await sb.auth.updateUser({ password: pw }); error ? setM(error.message) : done() }}>Update</button>
    {msg && <p className="text-sm text-red-600">{msg}</p>}</div>
}

function Main({ user }: { user: any }) {
  const [tab, setTab] = useState('home'), [subs, setSubs] = useState<any[]>([]), [mats, setMats] = useState<any[]>([]), [notes, setNotes] = useState<any[]>([]), [cls, setCls] = useState<any[]>([])
  const [open, setOpen] = useState<string | null>(null), [toast, setToast] = useState(''), [busy, setBusy] = useState(false)
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }
  async function load() {
    const [a, b, c, d] = await Promise.all([sb.from('subjects').select('*').order('created_at'), sb.from('materials').select('*').order('created_at', { ascending: false }), sb.from('notes').select('*').order('updated_at', { ascending: false }), sb.from('live_classes').select('*').order('starts_at')])
    const err = a.error || b.error || c.error || d.error
    if (err) return say(err.message)
    setSubs(a.data!); setMats(b.data!); setNotes(c.data!); setCls(d.data!)
  }
  useEffect(() => { load() }, [])
  const sn = (id: string) => subs.find(s => s.id === id)?.name ?? '—'
  const used = mats.reduce((t, m) => t + m.size, 0)
  const pdfs = mats.filter(m => m.kind === 'pdf'), photos = mats.filter(m => m.kind === 'photo')

  async function url(m: any, dl = false) {
    const { data, error } = await sb.storage.from('materials').createSignedUrl(m.path, 300, dl ? { download: m.name } : undefined)
    if (error) { say(error.message); return null }
    return data.signedUrl
  }
  async function view(m: any) { const u = await url(m); if (u) { window.open(u, '_blank'); await sb.from('materials').update({ last_opened: new Date().toISOString() }).eq('id', m.id); load() } }
  async function download(m: any) { const u = await url(m, true); if (u) location.href = u }
  async function upload(files: FileList | null, subject_id: string) {
    if (!files) return
    setBusy(true)
    for (const f of Array.from(files)) {
      const kind = f.type === 'application/pdf' ? 'pdf' : ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) ? 'photo' : null
      if (!kind) { say(`${f.name}: only PDF, JPG, PNG, WEBP allowed`); continue }
      if (f.size > MAX) { say(`${f.name}: over 20 MB`); continue }
      if (used + f.size > QUOTA) { say('Storage quota reached'); break }
      const path = `${user.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]/g, '_')}`
      const up = await sb.storage.from('materials').upload(path, f, { contentType: f.type })
      if (up.error) { say(up.error.message); continue }
      const ins = await sb.from('materials').insert({ subject_id, kind, name: f.name, path, size: f.size })
      if (ins.error) { await sb.storage.from('materials').remove([path]); say(ins.error.message) } else say(`Uploaded ${f.name}`)
    }
    setBusy(false); load()
  }
  async function delMat(m: any) { if (!confirm(`Delete "${m.name}"?`)) return; await sb.storage.from('materials').remove([m.path]); const { error } = await sb.from('materials').delete().eq('id', m.id); say(error ? error.message : 'Deleted'); load() }
  async function renMat(m: any) { const n = prompt('New name', m.name); if (n?.trim()) { await sb.from('materials').update({ name: n.trim() }).eq('id', m.id); load() } }
  async function fav(m: any) { await sb.from('materials').update({ favourite: !m.favourite }).eq('id', m.id); load() }

  const MatRow = ({ m }: { m: any }) => <div className={card + ' flex flex-wrap items-center justify-between gap-2'}>
    <div className="min-w-0"><div className="truncate font-medium">{m.kind === 'pdf' ? '📄' : '🖼️'} {m.name}</div><div className="text-xs text-zinc-500">{sn(m.subject_id)} · {day(m.created_at)} · {mb(m.size)}</div></div>
    <div className="flex gap-1 text-sm"><button className={ghost} onClick={() => fav(m)}>{m.favourite ? '★' : '☆'}</button><button className={ghost} onClick={() => view(m)}>Preview</button><button className={ghost} onClick={() => download(m)}>Download</button><button className={ghost} onClick={() => renMat(m)}>Rename</button><button className={ghost} onClick={() => delMat(m)}>Delete</button></div></div>

  const nav = [['home', 'Home'], ['subjects', 'Subjects'], ['search', 'Search'], ['notes', 'Notes'], ['classes', 'Live'], ['profile', 'Profile']]
  return <div className="mx-auto max-w-4xl p-4 pb-24">
    <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900 md:static md:mb-4 md:justify-start md:gap-2 md:border-0 md:bg-transparent md:p-0 dark:md:bg-transparent">
      {nav.map(([k, l]) => <button key={k} onClick={() => { setTab(k); setOpen(null) }} className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? 'bg-indigo-600 text-white' : ''}`}>{l}</button>)}</nav>
    {toast && <div className="fixed right-4 top-4 z-20 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white">{toast}</div>}

    {tab === 'home' && <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Welcome back{user.user_metadata?.full_name ? ', ' + user.user_metadata.full_name : ''} 👋</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['Materials', mats.length], ['Folders', subs.length], ['PDFs', pdfs.length], ['Photos', photos.length], ['Notes', notes.length], ['Live links', cls.length]].map(([l, v]) => <div key={l as string} className={card}><div className="text-2xl font-semibold">{v}</div><div className="text-xs text-zinc-500">{l}</div></div>)}</div>
      <h2 className="font-medium">Recently uploaded</h2>{mats.slice(0, 5).map(m => <MatRow key={m.id} m={m} />)}{!mats.length && <p className="text-sm text-zinc-500">Nothing yet. Open Subjects to upload your first file.</p>}
      <h2 className="font-medium">Recently opened</h2>{mats.filter(m => m.last_opened).sort((a, b) => b.last_opened.localeCompare(a.last_opened)).slice(0, 3).map(m => <MatRow key={m.id} m={m} />)}
      <h2 className="font-medium">Bookmarked</h2>{mats.filter(m => m.favourite).map(m => <MatRow key={m.id} m={m} />)}</div>}

    {tab === 'subjects' && (open ? <div className="space-y-3">
      <button className={ghost} onClick={() => setOpen(null)}>← Folders</button>
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">{sn(open)}</h1>
        <label className={btn + ' cursor-pointer'}>{busy ? 'Uploading…' : 'Upload PDF / photo'}<input type="file" hidden multiple accept="application/pdf,image/*" disabled={busy} onChange={e => { upload(e.target.files, open); e.target.value = '' }} /></label></div>
      {busy && <div className="h-1 animate-pulse rounded bg-indigo-600" />}
      {mats.filter(m => m.subject_id === open).map(m => <MatRow key={m.id} m={m} />)}
      {!mats.some(m => m.subject_id === open) && <p className={card + ' text-center text-sm text-zinc-500'}>This folder is empty. Upload a PDF or photo.</p>}</div>
      : <div className="space-y-3"><div className="flex justify-between"><h1 className="text-xl font-semibold">Subjects</h1>
        <button className={btn} onClick={async () => { const n = prompt('Folder name'); if (n?.trim()) { const { error } = await sb.from('subjects').insert({ name: n.trim() }); say(error ? error.message : 'Folder created'); load() } }}>+ New folder</button></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{subs.map(s => <div key={s.id} className={card}>
          <button className="w-full text-left" onClick={() => setOpen(s.id)}><div className="text-2xl">📁</div><div className="font-medium">{s.name}</div><div className="text-xs text-zinc-500">{mats.filter(m => m.subject_id === s.id).length} files</div></button>
          <div className="mt-2 flex gap-1"><button className={ghost} onClick={async () => { const n = prompt('Rename', s.name); if (n?.trim()) { await sb.from('subjects').update({ name: n.trim() }).eq('id', s.id); load() } }}>Rename</button>
            <button className={ghost} onClick={async () => { if (!confirm(`Delete "${s.name}" and all its files?`)) return; const ps = mats.filter(m => m.subject_id === s.id).map(m => m.path); if (ps.length) await sb.storage.from('materials').remove(ps); const { error } = await sb.from('subjects').delete().eq('id', s.id); say(error ? error.message : 'Folder deleted'); load() }}>Delete</button></div></div>)}</div></div>)}

    {tab === 'search' && <Search {...{ subs, mats, notes, cls, sn, MatRow }} />}
    {tab === 'notes' && <Notes {...{ subs, notes, load, say, sn }} />}
    {tab === 'classes' && <Classes {...{ subs, cls, load, say, sn }} />}
    {tab === 'profile' && <div className={card + ' space-y-3'}><div>{user.email}</div>
      <div><div className="text-sm">Storage: {mb(used)} / {mb(QUOTA)}</div><div className="mt-1 h-2 rounded bg-zinc-200 dark:bg-zinc-800"><div className="h-2 rounded bg-indigo-600" style={{ width: Math.min(100, used / QUOTA * 100) + '%' }} /></div></div>
      <button className={ghost} onClick={() => sb.auth.signOut()}>Log out</button></div>}
  </div>
}

function Search({ subs, mats, notes, cls, sn, MatRow }: any) {
  const [q, setQ] = useState(''), [sub, setSub] = useState(''), [type, setType] = useState(''), [since, setSince] = useState('')
  const r = useMemo(() => {
    const t = q.toLowerCase(), ok = (s: string, d: string, ty: string, ...txt: string[]) => (!sub || s === sub) && (!type || type === ty) && (!since || d >= since) && (!t || txt.some(x => (x || '').toLowerCase().includes(t)))
    return {
      subs: type || sub || since ? [] : subs.filter((s: any) => !t || s.name.toLowerCase().includes(t)),
      mats: mats.filter((m: any) => ok(m.subject_id, m.created_at, m.kind, m.name, sn(m.subject_id))),
      notes: notes.filter((n: any) => ok(n.subject_id, n.created_at, 'note', n.title, n.description, n.body)),
      cls: cls.filter((c: any) => ok(c.subject_id, c.created_at, 'class', c.title, c.description)),
    }
  }, [q, sub, type, since, subs, mats, notes, cls])
  return <div className="space-y-3"><input className={inp} placeholder="Search files, notes, subjects, classes…" value={q} onChange={e => setQ(e.target.value)} />
    <div className="grid grid-cols-3 gap-2"><select className={inp} value={sub} onChange={e => setSub(e.target.value)}><option value="">All subjects</option>{subs.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select className={inp} value={type} onChange={e => setType(e.target.value)}><option value="">All types</option><option value="pdf">PDF</option><option value="photo">Photo</option><option value="note">Note</option><option value="class">Live class</option></select>
      <input className={inp} type="date" value={since} onChange={e => setSince(e.target.value)} /></div>
    {r.subs.map((s: any) => <div key={s.id} className={card}>📁 {s.name}</div>)}{r.mats.map((m: any) => <MatRow key={m.id} m={m} />)}
    {r.notes.map((n: any) => <div key={n.id} className={card}>📝 <b>{n.title}</b> <span className="text-xs text-zinc-500">{sn(n.subject_id)}</span><p className="line-clamp-2 text-sm">{n.body}</p></div>)}
    {r.cls.map((c: any) => <div key={c.id} className={card}>🎥 <b>{c.title}</b> <span className="text-xs text-zinc-500">{new Date(c.starts_at).toLocaleString()}</span></div>)}</div>
}

function Notes({ subs, notes, load, say, sn }: any) {
  const [id, setId] = useState<string | null>(null), [f, setF] = useState<any>(null), [q, setQ] = useState('')
  const timer = useRef<any>(null)
  function pick(n: any) { setId(n.id); setF(n) }
  function edit(p: any) { const nf = { ...f, ...p }; setF(nf); clearTimeout(timer.current); timer.current = setTimeout(async () => { const { error } = await sb.from('notes').update({ title: nf.title, description: nf.description, body: nf.body, subject_id: nf.subject_id || null, updated_at: new Date().toISOString() }).eq('id', nf.id); error ? say(error.message) : say('Saved'); load() }, 900) }
  const list = notes.filter((n: any) => `${n.title} ${n.description} ${n.body}`.toLowerCase().includes(q.toLowerCase()))
  if (id && f) return <div className="space-y-2"><button className={ghost} onClick={() => setId(null)}>← Notes</button>
    <input className={inp} value={f.title} onChange={e => edit({ title: e.target.value })} placeholder="Title" />
    <input className={inp} value={f.description || ''} onChange={e => edit({ description: e.target.value })} placeholder="Description" />
    <select className={inp} value={f.subject_id || ''} onChange={e => edit({ subject_id: e.target.value })}><option value="">No subject</option>{subs.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <textarea className={inp + ' h-72'} value={f.body || ''} onChange={e => edit({ body: e.target.value })} placeholder="Write here — saves automatically" />
    <button className={ghost} onClick={async () => { if (!confirm('Delete this note?')) return; await sb.from('notes').delete().eq('id', id); setId(null); load() }}>Delete note</button></div>
  return <div className="space-y-3"><div className="flex gap-2"><input className={inp} placeholder="Search notes" value={q} onChange={e => setQ(e.target.value)} />
    <button className={btn} onClick={async () => { const { data, error } = await sb.from('notes').insert({ title: 'Untitled' }).select().single(); if (error) say(error.message); else { await load(); pick(data) } }}>+ Note</button></div>
    {list.map((n: any) => <button key={n.id} className={card + ' block w-full text-left'} onClick={() => pick(n)}><b>{n.title}</b> <span className="text-xs text-zinc-500">{sn(n.subject_id)} · {day(n.updated_at)}</span><p className="line-clamp-2 text-sm text-zinc-500">{n.body}</p></button>)}
    {!list.length && <p className={card + ' text-center text-sm text-zinc-500'}>No notes yet.</p>}</div>
}

function Classes({ subs, cls, load, say, sn }: any) {
  const [f, setF] = useState({ title: '', link: '', starts_at: '', subject_id: '', description: '' })
  async function add() {
    if (!f.title || !f.starts_at || !/^https:\/\//i.test(f.link)) return say('Title, date/time and an https:// link are required')
    const { error } = await sb.from('live_classes').insert({ ...f, subject_id: f.subject_id || null, starts_at: new Date(f.starts_at).toISOString() })
    if (error) return say(error.message)
    setF({ title: '', link: '', starts_at: '', subject_id: '', description: '' }); load()
  }
  const now = Date.now(), up = cls.filter((c: any) => +new Date(c.starts_at) >= now), past = cls.filter((c: any) => +new Date(c.starts_at) < now).reverse()
  const Row = ({ c }: any) => <div className={card + ' flex items-center justify-between gap-2'}><div><b>{c.title}</b><div className="text-xs text-zinc-500">{sn(c.subject_id)} · {new Date(c.starts_at).toLocaleString()}</div><div className="text-sm">{c.description}</div></div>
    <div className="flex gap-1"><a className={btn} href={c.link} target="_blank" rel="noopener noreferrer">Join</a><button className={ghost} onClick={async () => { if (confirm('Delete?')) { await sb.from('live_classes').delete().eq('id', c.id); load() } }}>✕</button></div></div>
  return <div className="space-y-3"><div className={card + ' grid gap-2 md:grid-cols-2'}>
    <input className={inp} placeholder="Class title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
    <input className={inp} placeholder="Meet / Zoom / Teams link (https://…)" value={f.link} onChange={e => setF({ ...f, link: e.target.value })} />
    <input className={inp} type="datetime-local" value={f.starts_at} onChange={e => setF({ ...f, starts_at: e.target.value })} />
    <select className={inp} value={f.subject_id} onChange={e => setF({ ...f, subject_id: e.target.value })}><option value="">No subject</option>{subs.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    <input className={inp + ' md:col-span-2'} placeholder="Description" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
    <button className={btn} onClick={add}>Save class</button></div>
    <h2 className="font-medium">Upcoming</h2>{up.map((c: any) => <Row key={c.id} c={c} />)}{!up.length && <p className="text-sm text-zinc-500">No upcoming classes.</p>}
    <h2 className="font-medium">Previous</h2>{past.map((c: any) => <Row key={c.id} c={c} />)}</div>
}
