import React, { useState } from 'react';
import { api } from '../lib/api';
import { useApp, useLoad } from '../lib/app';
import { useFmt } from '../lib/format';
import { resizeImage } from '../lib/image';
import { ClosedPassport, PassportBook } from '../passport';
import { ErrorState, Field, Icon, Loading, Modal, PageHead, useBusy } from '../ui';

/** Add a photo memory to the passport: the photo, where, which governorate, when, and a short note. */
export function AddMemory({ onClose, onDone }: { onClose(): void; onDone(): void }) {
  const { t, meta, toast, errorText } = useApp();
  const fmt = useFmt();
  const today = meta.today as string;
  const [f, setF] = useState({ img: '', place: '', city: '', date: today, note: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useBusy();
  const up = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const touch = (k: string) => setTouched((x) => ({ ...x, [k]: true }));
  const errors: Record<string, string> = {};
  if (!f.img) errors.img = t('pp.v_photo');
  if (f.place.trim().length < 2) errors.place = t('pp.v_place');
  if (!f.city) errors.city = t('pp.v_city');
  if (!f.date) errors.date = t('pp.v_date');
  else if (f.date > today) errors.date = t('err.date_future');
  const show = (k: string) => (touched[k] || touched.all ? errors[k] : undefined);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      up({ img: await resizeImage(file, { max: 1100 }) });
      touch('img');
    } catch {
      toast(t('err.photo_invalid'), 'error');
    }
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (Object.keys(errors).length) {
      touch('all');
      return;
    }
    run(async () => {
      try {
        await api('POST', '/me/passport', { ...f, place: f.place.trim(), note: f.note.trim() });
        toast(t('pp.added'));
        onDone();
      } catch (x) {
        setError(errorText(x));
        throw x;
      }
    });
  };
  return (
    <Modal title={t('pp.add_title')} onClose={onClose}>
      <form className="stack" onSubmit={save} noValidate>
        <label className="pp-photo-drop" aria-label={t('pp.photo')}>
          {f.img ? (
            <>
              <img src={f.img} alt="" />
              <span className="pp-change">{t('pp.change_photo')}</span>
            </>
          ) : (
            <>
              <Icon name="camera" size={30} />
              <strong>{t('pp.photo')}</strong>
              <span className="xs">{t('pp.photo_hint')}</span>
            </>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pick} />
        </label>
        {show('img') && <span className="err small">{show('img')}</span>}
        <Field label={t('pp.place')} error={show('place')}>
          <input className="input" dir="auto" value={f.place} maxLength={60} placeholder={t('pp.place_ph')} onBlur={() => touch('place')} onChange={(e) => up({ place: e.target.value })} />
        </Field>
        <div className="row" style={{ gap: 10, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Field label={t('pp.city')} error={show('city')}>
              <select className="input" value={f.city} onBlur={() => touch('city')} onChange={(e) => { up({ city: e.target.value }); touch('city'); }}>
                <option value="">{t('common.choose')}</option>
                {meta.cities.map((c: any) => (
                  <option key={c.slug} value={c.slug}>
                    {fmt.city(c.slug)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Field label={t('pp.date')} error={show('date')}>
              <input className="input" type="date" max={today} value={f.date} onChange={(e) => { up({ date: e.target.value }); touch('date'); }} />
            </Field>
          </div>
        </div>
        <Field label={t('pp.note')} hint={t('pp.note_hint')}>
          <textarea className="input" dir="auto" rows={2} maxLength={160} value={f.note} onChange={(e) => up({ note: e.target.value })} />
        </Field>
        {error && (
          <div className="note danger" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn lg" disabled={busy}>
          {t('pp.save')}
        </button>
      </form>
    </Modal>
  );
}

/** The tourist's own passport: open, with adding and removing pages. */
export function PassportScreen() {
  const { t, me, refreshMe, toast, errorText, ask } = useApp();
  const res = useLoad(() => (me ? api('GET', `/users/${me.id}`) : Promise.resolve(null)), [me?.id]);
  const [adding, setAdding] = useState(false);
  if (!me) return null;
  if (me.role !== 'tourist') return <div className="page"><div className="note">{t('pp.only_tourists')}</div></div>;
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const u = res.data;
  const remove = async (id: number) => {
    if (!(await ask(t('pp.remove_q'), t('pp.remove'), { danger: true }))) return;
    try {
      await api('DELETE', `/me/passport/${id}`);
      await Promise.all([res.reload(), refreshMe()]);
      toast(t('pp.removed'));
    } catch (x) {
      toast(errorText(x), 'error');
    }
  };
  return (
    <div className="page passport-page">
      <PageHead title={t('pp.mine')} backTo="/profile" />
      <PassportBook key={u.passport.pages.length} holder={u} data={u.passport} trips={u.stats.tripsCompleted} editable onAdd={() => setAdding(true)} onDelete={remove} />
      {adding && (
        <AddMemory
          onClose={() => setAdding(false)}
          onDone={async () => {
            setAdding(false);
            await Promise.all([res.reload(), refreshMe()]);
          }}
        />
      )}
    </div>
  );
}

/** On a tourist's profile: their passport, closed until tapped. */
export function TouristPassport({ u }: { u: any }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  if (!u.passport) return null;
  return (
    <section className="stack" style={{ gap: 12 }}>
      <h2>{t('pp.theirs')}</h2>
      {open ? <PassportBook holder={u} data={u.passport} trips={u.stats.tripsCompleted} /> : <ClosedPassport name={u.name} pages={u.passport.pages.length} onOpen={() => setOpen(true)} />}
    </section>
  );
}
