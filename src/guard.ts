// Hand-maintained seed aliases (en / ko / ja). Deliberately not an exhaustive entity recognizer.
// Update this list in source control; streamer additions apply to all generation entry points.
export const names = [
  'BTS','방탄소년단','防弾少年団','Jungkook','정국','ジョングク','Jimin','지민','ジミン',
  'BLACKPINK','블랙핑크','ブラックピンク','Jennie','제니','ジェニー','Lisa','리사','リサ',
  'TWICE','트와이스','トゥワイス','NewJeans','뉴진스','ニュージーンズ','aespa','에스파','エスパ',
  'Stray Kids','스트레이 키즈','ストレイキッズ','LE SSERAFIM','르세라핌','ルセラフィム',
  'SEVENTEEN','세븐틴','セブンティーン','IVE','아이브','アイヴ','EXO','엑소','NCT',
  'PLAVE','플레이브','MAVE','naevis','Taylor Swift','Ariana Grande','Billie Eilish','Elon Musk',
  '初音ミク','Hatsune Miku','하츠네 미쿠','Naruto','ナルト','나루토','Sasuke','サスケ',
  'One Piece','ワンピース','원피스','Luffy','ルフィ','루피','Goku','悟空','오공','Dragon Ball','ドラゴンボール',
  'Demon Slayer','鬼滅の刃','귀멸의 칼날','Tanjiro','炭治郎','Nezuko','禰豆子',
  'Jujutsu Kaisen','呪術廻戦','주술회전','Gojo','五条悟','고죠','Sailor Moon','セーラームーン',
  'Pokemon','Pokémon','ポケモン','포켓몬','Pikachu','ピカチュウ','피카츄','Mario','マリオ','마리오',
  'Zelda','ゼルダ','젤다','Genshin Impact','原神','원신','Honkai','崩壊','붕괴',
  'Mickey Mouse','ミッキーマウス','Disney','ディズニー','Batman','Spider-Man','Spider Man',
];
export const normalize = (s:string) => s.normalize('NFKC').toLowerCase().replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g,'');
function contains(text:string, word:string):boolean {
  const w=normalize(word).trim(); if(!w) return false;
  // Latin aliases use word boundaries so IVE does not block "give" or "live".
  if (/^[a-z\d\s-]+$/.test(w)) {
    const escaped=w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[\s-]+/g,'[\\s._-]*');
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`,'iu').test(text);
  }
  return text.replace(/\s/g,'').includes(w.replace(/\s/g,''));
}
export function guard(text:string, extra:string[]=[], mode:'comment'|'generation'='comment'):string|null {
  const n=normalize(text);
  if (names.some(w=>contains(n,w))) return 'protected_name';
  if (extra.some(w=>normalize(w).trim() && n.includes(normalize(w).trim()))) return 'blocked_word';
  if (mode === 'comment' && !text.trim()) return 'empty';
  if (mode==='comment' && /\b(?:[0-9]|1[0-7])[- ]?(?:years?[- ]old|yo)\b|\bteen(?:ager)?\b|(?:[0-9]|1[0-7])歳|中学生|小学生|高校生|어린이|미성년자/i.test(n)) return 'unsafe_content';
  if (/https?:\/\/|www\.|@[\w]{2,}/i.test(n)) return 'external_reference';
  if (/\b(?:nsfw|nude|naked|porn|sex|sexual|kill|gore|suicide|underage|child|children|loli|shota)\b|エロ|裸|殺して|殺す|幼女|未成年|ロリ|ショタ|섹스|누드|미성년|살인/u.test(n) && mode==='comment') return 'unsafe_content';
  if (/look\s+like|resembl(?:e|ing)\s+(?!a real|any real)|in the likeness|impersonate|clone.+voice|choreography\s+(?:of|from)|に似せ|そっくり|の振付|처럼\s*(?:생긴|만들)|안무|parec(?:ida|ido)\s+a/i.test(n)) return 'imitation';
  return null;
}
export function assertSafe(text:string,extra:string[]=[],mode:'comment'|'generation'='generation'):void { const reason=guard(text,extra,mode); if(reason) throw new Error(`Original characters only: ${reason}`); }
