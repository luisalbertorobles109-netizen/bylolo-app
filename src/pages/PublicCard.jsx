import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function PublicCard() {
  const { token } = useParams();
  const [card, setCard] = useState(undefined);

  useEffect(() => {
    supabase.rpc('get_loyalty_card', { token }).then(({ data, error }) => {
      setCard(error || !data?.length ? null : data[0]);
    });
  }, [token]);

  if (card === undefined) return <div className="pc-wrap"><div className="pc-loading">Cargando tu tarjeta…</div></div>;
  if (card === null) return <div className="pc-wrap"><div className="pc-loading">Tarjeta no encontrada.</div></div>;

  const perLevel = card.stars_per_level || 7;
  const rewardEvery = card.rewards?.[0]?.every_stars || 10;
  const rewardText = card.rewards?.[0]?.reward || 'una recompensa';
  const inLevel = card.stamps % perLevel;
  const toReward = (rewardEvery - (card.stamps % rewardEvery)) % rewardEvery;
  const stars = Array.from({ length: perLevel });
  const tier = (card.tier_name || 'Plata').toLowerCase();

  return (
    <div className="pc-wrap">
      <div className={'pc-card tier-' + tier}>
        <div className="pc-shine" />
        <img src="/logo-marshmallow.png" alt="Marshmallow Beauty Center" className="pc-logo" />

        <div className="pc-tier-badge">{card.tier_name}</div>
        <div className="pc-name">{card.client_name}</div>
        <div className="pc-sub">Tarjeta de cliente frecuente</div>

        <div className="pc-stars">
          {stars.map((_, i) => (
            <span key={i} className={'pc-star' + (i < inLevel ? ' on' : '')}>★</span>
          ))}
        </div>

        <div className="pc-progress-label">
          {inLevel}/{perLevel} en este nivel · <b>⭐ {card.stamps}</b> en total
        </div>

        {card.rewards_available > 0 ? (
          <div className="pc-reward ready">🎁 ¡Tienes {card.rewards_available} premio(s)! Pídelo en tu visita.</div>
        ) : (
          <div className="pc-reward">Te faltan <b>{toReward}</b> estrella(s) para {rewardText}</div>
        )}

        <div className="pc-foot">
          Acumula 1 estrella por servicio. Cada {rewardEvery} estrellas obtienes {rewardText}.
          <br />Niveles: Plata → Oro → Diamante.
        </div>
      </div>
      <div className="pc-powered">Programa de lealtad · Marshmallow Beauty Center</div>
    </div>
  );
}
