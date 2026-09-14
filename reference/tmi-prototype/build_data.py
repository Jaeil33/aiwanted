"""Build data.json for the TMI baseball prototype from cached Naver relay games (2026-08-01..09-13) and 2026 season stats.

Outputs league plate-appearance mix, a per-count pitch-result table, four real high-leverage moments with lineups,
player rates (shrunk toward league, relative to league like pilot_player_sim.py), team bullpen composites,
and every tracked pitch (PTS kinematics) of the scenario pitchers so the page can replay real trajectories.
Usage: python build_data.py
"""
import glob
import json
import os
import statistics
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
K_H, K_P = 200.0, 250.0
CODES = {'B': 0, 'T': 1, 'S': 2, 'V': 2, 'F': 3, 'W': 3, 'H': 4}
TYPES = ['직구', '투심', '커터', '슬라이더', '스위퍼', '커브', '체인지업', '포크', '기타']
SCENARIOS = [
    dict(id='walkoff-slam', game='20260825LTHT02026', inning=9, half=1, batter='이호연', title='9회말 2사 만루, 대타 한 방'),
    dict(id='walkoff-walk', game='20260902HTNC02026', inning=9, half=1, batter='김형준', title='9회말 2사 만루, 제구 싸움'),
    dict(id='extra-go-ahead', game='20260830NCHH02026', inning=10, half=0, batter='천재환', title='10회초 2사 2·3루, 마무리와 승부'),
    dict(id='eleventh-last', game='20260910NCHT02026', inning=11, half=1, batter='김선빈', title='11회말 1사 1·3루, 마지막 이닝'),
]


def f(v):
    return float(v or 0)


def innings(s):
    tot = 0.0
    for part in str(s or '0').replace('⅓', ' 1/3').replace('⅔', ' 2/3').split():
        a, _, b = part.partition('/')
        tot += float(a) / float(b) if b else float(a)
    return tot


def rel(counts, prior, lg):
    n = sum(counts)
    rate = [(c + prior * l) / (n + prior) for c, l in zip(counts, lg)]
    tot = sum(rate)
    return [round(r / tot / l, 4) for r, l in zip(rate, lg)]


def season():
    hitters = json.load(open(os.path.join(SRC, 'stats_2026_HITTER_all.json'), encoding='utf-8'))['result']['seasonPlayerStats']
    pitchers = json.load(open(os.path.join(SRC, 'stats_2026_PITCHER_all.json'), encoding='utf-8'))['result']['seasonPlayerStats']
    hit, pit = {}, {}
    for p in hitters:
        ab, h, d2, d3, hr = (f(p.get(k)) for k in ('hitterAb', 'hitterHit', 'hitterH2', 'hitterH3', 'hitterHr'))
        bb, hp, k = f(p.get('hitterBb')), f(p.get('hitterHp')), f(p.get('hitterKk'))
        if ab + bb + hp <= 0:
            continue
        hit[p['playerId']] = dict(name=p['playerName'], team=p['teamId'], c=[k, bb + hp, hr, d3, d2, h - d2 - d3 - hr, ab - h - k],
                                  line=dict(pa=int(ab + bb + hp), avg=round(h / ab, 3) if ab else 0, obp=f(p.get('hitterObp')),
                                            slg=f(p.get('hitterSlg')), hr=int(hr), k=int(k), bb=int(bb)))
    tot = [sum(x['c'][i] for x in hit.values()) for i in range(7)]
    lg_h = [t / sum(tot) for t in tot]
    nonhr = tot[3] + tot[4] + tot[5]
    for p in pitchers:
        ip = innings(p.get('pitcherInning'))
        if ip <= 0:
            continue
        h, hr, bb, hp, k = (f(p.get(x)) for x in ('pitcherHit', 'pitcherHr', 'pitcherBb', 'pitcherHp', 'pitcherKk'))
        nh = h - hr
        pit[p['playerId']] = dict(name=p['playerName'], team=p['teamId'], ip=ip, g=f(p.get('pitcherGameCount')),
                                  c=[k, bb + hp, hr, nh * tot[3] / nonhr, nh * tot[4] / nonhr, nh * tot[5] / nonhr, max(3 * ip - k, 0.0)],
                                  line=dict(era=f(p.get('pitcherEra')), ip=p.get('pitcherInning'), k=int(k), bb=int(bb), whip=f(p.get('pitcherWhip')),
                                            sv=int(f(p.get('pitcherSave'))), hold=int(f(p.get('pitcherHold'))), g=int(f(p.get('pitcherGameCount')))))
    tot_p = [sum(x['c'][i] for x in pit.values()) for i in range(7)]
    lg_p = [t / sum(tot_p) for t in tot_p]
    for x in hit.values():
        x['rel'] = rel(x['c'], K_H, lg_h)
    for x in pit.values():
        x['rel'] = rel(x['c'], K_P, lg_p)
    return hit, pit, lg_h, lg_p


def bullpen(pit, lg_p, code):
    pen = [x for x in pit.values() if x['team'] == code and x['g'] >= 8 and x['ip'] / x['g'] < 2.0]
    c = [sum(x['c'][i] for x in pen) for i in range(7)]
    return dict(id=f'{code}-pen', name='불펜', rel=rel(c, K_P, lg_p), n=len(pen))


def chrono(game):
    relays = [r for r in game['textRelays'] if r['textOptions']]
    return sorted(relays, key=lambda r: min(t.get('seqno', 0) for t in r['textOptions']))


def pitch_row(t, p, balls, strikes):
    stuff = t.get('stuff') if t.get('stuff') in TYPES else '기타'
    return [TYPES.index(stuff), int(f(t.get('speed'))), CODES[t['pitchResult']], balls, strikes, 0 if p.get('stance') == 'L' else 1,
            *(round(p[k], 3) for k in ('x0', 'z0', 'vx0', 'vy0', 'vz0', 'ax', 'ay', 'az', 'topSz', 'bottomSz'))]


def walk_pitches(opts, pts):
    """Yield (textOption, pts or None, balls before, strikes before) for each pitch of one plate appearance."""
    b = s = 0
    for t in opts:
        if t['type'] != 1 or t.get('pitchResult') not in CODES:
            continue
        yield t, pts.get(t.get('ptsPitchId')), b, s
        code = t['pitchResult']
        if code == 'B':
            b = min(b + 1, 3)
        elif code in ('T', 'S', 'V', 'F', 'W'):
            s = min(s + 1, 2)


def event_of(text):
    for key, e in (('삼진', 0), ('볼넷', 1), ('고의4구', 1), ('몸에 맞는', 1), ('홈런', 2), ('3루타', 3), ('2루타', 4), ('1루타', 5), ('안타', 5)):
        if key in text:
            return e
    return 6


def main():
    hit, pit, lg_h, lg_p = season()
    games = {os.path.basename(p)[:-5]: p for p in glob.glob(os.path.join(SRC, 'naver', 'games', '*.json'))}
    table = defaultdict(Counter)
    by_pitcher = defaultdict(list)
    for gid, path in sorted(games.items()):
        g = json.load(open(path, encoding='utf-8'))
        for r in chrono(g):
            opts = sorted(r['textOptions'], key=lambda t: t.get('seqno', 0))
            head = next((t for t in opts if t['type'] == 8), None)
            if head is None:
                continue
            pts = {p['pitchId']: p for p in (r.get('ptsOptions') or [])}
            for t, p, b, s in walk_pitches(opts, pts):
                table[(b, s)][CODES[t['pitchResult']]] += 1
                pitcher = (t.get('currentGameState') or {}).get('pitcher') or head['currentGameState']['pitcher']
                if p:
                    by_pitcher[pitcher].append(pitch_row(t, p, b, s))
    count_table = []
    for b in range(4):
        for s in range(3):
            c = table[(b, s)]
            n = sum(c.values())
            count_table.append([round(c[i] / n, 4) for i in range(5)])

    players, pitch_db, bullpens, scenarios = {}, {}, {}, []
    for sc in SCENARIOS:
        g = json.load(open(games[sc['game']], encoding='utf-8'))
        meta = g['game']
        lineups = {'away': [None] * 9, 'home': [None] * 9}
        hands = {}
        last_order = {'away': 0, 'home': 0}
        prev_wp = None
        target = None
        for r in chrono(g):
            opts = sorted(r['textOptions'], key=lambda t: t.get('seqno', 0))
            head = next((t for t in opts if t['type'] == 8), None)
            if head is None or not head.get('batterRecord'):
                continue
            side = 'home' if r['homeOrAway'] == '1' else 'away'
            br = head['batterRecord']
            is_target = r['inn'] == sc['inning'] and (1 if side == 'home' else 0) == sc['half'] and br['name'] == sc['batter']
            lineups[side][br['batOrder'] - 1] = br['pcode']
            hands[br['pcode']] = br.get('hitType') or ''
            if is_target:
                target = (r, opts, head, side)
                break
            last_order[side] = br['batOrder']
            if r.get('metricOption'):
                prev_wp = r['metricOption'].get('homeTeamWinRate')
        assert target, sc
        r, opts, head, side = target
        gs = head['currentGameState']
        br = head['batterRecord']
        pts = {p['pitchId']: p for p in (r.get('ptsOptions') or [])}
        result = next((t['text'] for t in opts if t['type'] in (13, 23)), '')
        runs_in = sum(1 for t in opts if t['type'] in (14, 24) and '홈인' in t['text'])
        event = event_of(result)
        actual = dict(result=result, event=event, runs=runs_in + (1 if event == 2 else 0),
                      notes=[t['text'] for t in opts if t['type'] in (14, 24)],
                      pitches=[pitch_row(t, p, b, s) for t, p, b, s in walk_pitches(opts, pts) if p],
                      wpAfterHome=(r.get('metricOption') or {}).get('homeTeamWinRate'))
        other = 'home' if side == 'away' else 'away'
        slot = {side: br['batOrder'] - 1, other: last_order[other] % 9}
        missing = [(sd, i) for sd in ('away', 'home') for i, x in enumerate(lineups[sd]) if x is None or x not in hit]
        assert not missing, (sc['id'], missing)
        for pc in lineups['away'] + lineups['home']:
            x = hit[pc]
            ht = hands.get(pc, '')
            players[pc] = dict(name=x['name'], team=x['team'], kind='H', bats=('S' if '양타' in ht else 'L' if '좌타' in ht else 'R'),
                               rel=x['rel'], line=x['line'])
        pc = gs['pitcher']
        x = pit[pc]
        rows = by_pitcher[pc]
        throws = 'L' if statistics.median(r_[6] for r_ in rows) > 0 else 'R'
        players[pc] = dict(name=x['name'], team=x['team'], kind='P', throws=throws, rel=x['rel'], line=x['line'])
        pitch_db[pc] = rows
        for code in (meta['awayTeamCode'], meta['homeTeamCode']):
            bullpens.setdefault(code, bullpen(pit, lg_p, code))
        bases = sum(1 << i for i in range(3) if gs[f'base{i + 1}'] not in ('0', '', None))
        scenarios.append(dict(
            id=sc['id'], title=sc['title'], date=meta['gameDate'], stadium=meta['stadium'],
            away=dict(code=meta['awayTeamCode'], name=meta['awayTeamName'], final=meta['awayTeamScore']),
            home=dict(code=meta['homeTeamCode'], name=meta['homeTeamName'], final=meta['homeTeamScore']),
            state=dict(inning=sc['inning'], half=sc['half'], outs=int(gs['out']), bases=bases, away=int(gs['awayScore']), home=int(gs['homeScore']),
                       slotAway=slot['away'], slotHome=slot['home']),
            batter=br['pcode'], pitcher=pc, lineups=lineups, naverWpBeforeHome=prev_wp, actual=actual))
        print(f"{sc['id']}: {meta['gameDate']} {meta['awayTeamName']}@{meta['homeTeamName']} {sc['inning']}회{'초' if sc['half'] == 0 else '말'} "
              f"{gs['awayScore']}:{gs['homeScore']} {gs['out']}아웃 bases={bases:03b} | {br['name']}(slot {br['batOrder']}, {hands.get(br['pcode'])}) vs "
              f"{x['name']}({throws}, {len(rows)} tracked) | naver home WP before {prev_wp} after {actual['wpAfterHome']} | {result} runs={actual['runs']}")
        for sd in ('away', 'home'):
            print(f"   {sd} next slot {slot[sd] + 1}: " + ', '.join(f"{i + 1}.{hit[p]['name']}" for i, p in enumerate(lineups[sd])))
        print('   actual pitches:', [(TYPES[p[0]], p[1], 'BTSFH'[p[2]], f'{p[3]}-{p[4]}') for p in actual['pitches']], '| notes', actual['notes'])
    out = dict(meta=dict(season=2026, relayRange=['2026-08-01', '2026-09-13'], relayGames=len(games), pitchTypes=TYPES,
                         rowFormat='type,speed,code(B T S F H),balls,strikes,stance(0L 1R),x0,z0,vx0,vy0,vz0,ax,ay,az,topSz,bottomSz; y0=55ft'),
               lg=[round(x, 5) for x in lg_h], countTable=count_table, players=players, bullpens=bullpens, pitchDB=pitch_db, scenarios=scenarios)
    path = os.path.join(HERE, 'data.json')
    json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('league mix', out['lg'], '| bullpens', {k: (v['n'], v['rel']) for k, v in bullpens.items()})
    print('wrote', path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()
