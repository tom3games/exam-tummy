// 文言（日英）と遊びの数字。仕様の正本は ~/Desktop/claudecode/ideas/exam-tummy.md
window.ET_DATA = {
  URL: 'https://tom3games.github.io/exam-tummy/',
  DUR: 150,            // 試験の長さ（秒）。時計は 10:00 から 11:00
  QN: 80,              // 問題数（答案をタップして1問ずつ解く）
  STROKES: 5,          // 1問に要るタップ
  TAP_MIN: 0.12,       // タップの間の最短（連打しすぎても速くならない）
  READ: 0.9,           // 1問解いてから次の問題を読む間
  ANS_PT: 1.3,         // 1問の重み（判定値）
  WIN_PRE: 0.38,       // 輪が重なる瞬間より前に押してよい幅
  WIN_POST: 0.45,      // 重なった後に押してよい幅（反応0.25〜0.4秒でも間に合う）
  COUGH_CD: 5,         // 咳払いの後、喉が落ち着くまで
  PICK: 1.2,           // 鉛筆を拾う時間（その間は何もできない）
  RESIT: 0.6,          // 座り直す時間
  SUS_WIN: 7, SUS_N: 3, // 同じ物を7秒以内に続けて3回使うと監督が怪しむ
  SIZE: { cough: 1, chair: 2, pen: 3 },
  PAUSE: { cough: 0.5, chair: 0.6, pen: 0.3, bust: 1.5 },  // 書く手が止まる秒数
  RUMBLE_LEN: [0, 0.7, 1.1, 1.7],
  COVER_LEN: { cough: 0.55, chair: 0.9, pen: 1.2 },
  RANKS: [   // 判定値の下限と称号
    [160, 'S'], [115, 'A'], [70, 'B'], [25, 'C'], [-20, 'D'], [-1e9, 'E'],
  ],
  T: {
    ja: {
      title: '試験中にお腹が鳴る', sub: 'TUMMY RUMBLE EXAM',
      coverHd: '問題冊子', coverNo: '受験番号 0721',
      note1: 'お腹が鳴っても試験は止まらない', note2: '鳴る前に体が教えてくれる',
      start: 'はじめ', how: '遊び方', back: 'もどる', loading: '鉛筆を削っています',
      howT: '注意事項',
      h1: 'お腹が光ると、外から<b>輪</b>が縮んでくる。輪が印に重なった瞬間に鳴る。途中で消えたら鳴らない',
      h2: '光の色が大きさ。<i class="c1">黄</i>は咳払い、<i class="c2">橙</i>は椅子、<i class="c3">赤</i>はペンを落とす',
      h3: '大きさが合わないとばれる。大きすぎる音も、全員こっちを見る',
      h4: '工事・くしゃみ・チャイムが鳴っている間は、何もしなくていい',
      h5: '鳴らない間は<b>答案をタップ</b>して解く。咳は少し休むと戻る。椅子は座り直す、ペンは拾う。同じ物ばかりだと監督が怪しむ',
      bCough: '咳払い', bChair: '椅子ギィ', bPen: 'ペン落とし',
      sz1: '小', sz2: '中', sz3: '大',
      tut1: '輪が縮んでくる', tut2: '重なったら同じ色', tut5: '答案をタップして解く', bSit: '座り直す', bPick: '拾う', sFidget: '…落ち着きない', sAgain: '…また？', tut3: '工事の音に隠れる', tut4: '何もしない',
      go: 'はじめ', stop: 'やめ',
      vSafe: 'ごまかした', vExt: 'かき消えた', vBust: '鳴った！', vSmall: '小さすぎ！', vBig: 'やりすぎ！', vMiss: '空振り', vSus: '怪しまれた',
      grRumble: ['きゅるる', 'ぐぅ〜', 'ぐおおぉぉ'],
      oCough: 'ゴホン', oChair: 'ギィッ', oPen: 'カシャーン', oDrill: 'ガガガガ', oSneeze: 'ハックション', oChime: 'キーンコーン', oRoll: 'コロコロ', oTeacher: 'ぐぅ…',
      sCold: '…風邪？', sMask: 'これ着けて', sChairBreak: '…', sGiggle: 'ふふっ', sAll: 'ざわっ', sProctorCough: 'ゴホン', sTicket: '本人です', sCheck: '…本人？', sRoll: '3かな',
      sEndGrand: 'もう一回受けるわ', sTeacherBig: '…先生？',
      resHd: '採点結果', rRumble: '鳴った', rSafe: 'ごまかした', rBust: 'ばれた', rAns: '解いた問題', rUnit: '回', rQ: '問',
      again: 'もう一回', toTitle: 'タイトル', save: '画像を保存', xPost: 'Xでポスト',
      rankName: { S: '沈黙の胃袋', A: '腹の音の達人', B: '隣の人だけ知ってる', C: '教室公認の腹ペコ', D: '腹の音で受かる人', E: '教室のBGM係' },
      rankCmt: {
        S: '静かな答案でした', A: 'ほぼ聞こえませんでした', B: '前の席までは届いてた', C: '監督も気づいてました', D: '全員お腹すいてきた', E: '試験より目立ってた',
      },
      blank: '白紙の勇者', blankCmt: '鉛筆は前日に買おう',
      teacherRare: '監督の方が鳴ってた',
      xText: (r) => `試験中にお腹が${r.rumble}回鳴って、${r.safe}回ごまかし${r.bust}回ばれた「${r.rank}」 #試験中にお腹が鳴る`,
      subjects: ['数学', '英語', '国語', '世界史', '化学'],
      board: '試験中', boardSub: '私語厳禁',
    },
    en: {
      title: 'Tummy Rumble Exam', sub: 'DON\'T LET IT GROWL',
      coverHd: 'EXAM BOOKLET', coverNo: 'Seat No. 0721',
      note1: 'The exam goes on even if your tummy growls', note2: 'Your body warns you first',
      start: 'Begin', how: 'How to play', back: 'Back', loading: 'Sharpening pencils',
      howT: 'Instructions',
      h1: 'When your tummy glows, a <b>ring</b> shrinks in. It growls the moment the ring hits the mark. If the ring vanishes, it won\'t',
      h2: 'The color is the size. <i class="c1">Yellow</i> cough, <i class="c2">orange</i> chair, <i class="c3">red</i> drop your pen',
      h3: 'Wrong size and you get caught. Too loud makes everyone look too',
      h4: 'During drilling, sneezes or the chime, just do nothing',
      h5: 'Between growls, <b>tap the answer sheet</b> to solve. Coughs come back after a rest. Sit up straight, pick up your pen. Same trick too often and the proctor gets suspicious',
      bCough: 'Cough', bChair: 'Creak', bPen: 'Drop pen',
      sz1: 'S', sz2: 'M', sz3: 'L',
      tut1: 'A ring closes in', tut2: 'Now, same color', tut5: 'Tap the sheet to solve', bSit: 'Sit up', bPick: 'Pick up', sFidget: 'Restless?', sAgain: 'Again?', tut3: 'Hide in the drilling', tut4: 'Do nothing',
      go: 'Begin', stop: 'Pens down',
      vSafe: 'Covered', vExt: 'Drowned out', vBust: 'Heard it!', vSmall: 'Too quiet!', vBig: 'Too loud!', vMiss: 'For nothing', vSus: 'Suspicious',
      grRumble: ['gurgle', 'grrowl', 'GRROOOWL'],
      oCough: 'Ahem', oChair: 'Creak', oPen: 'Clatter', oDrill: 'Brrrrt', oSneeze: 'Achoo', oChime: 'Ding dong', oRoll: 'Roll', oTeacher: 'grr…',
      sCold: 'A cold?', sMask: 'Wear this', sChairBreak: '…', sGiggle: 'heh', sAll: 'Gasp', sProctorCough: 'Ahem', sTicket: 'That\'s me', sCheck: '…You?', sRoll: 'Maybe 3',
      sEndGrand: 'I\'ll retake it', sTeacherBig: 'Sir…?',
      resHd: 'Graded', rRumble: 'Growls', rSafe: 'Covered', rBust: 'Caught', rAns: 'Solved', rUnit: '', rQ: '',
      again: 'Again', toTitle: 'Title', save: 'Save image', xPost: 'Post on X',
      rankName: { S: 'Silent Stomach', A: 'Growl Master', B: 'Only My Neighbor Knows', C: 'Officially Hungry', D: 'Passed by Growling', E: 'Class Soundtrack' },
      rankCmt: {
        S: 'A very quiet paper', A: 'Barely heard a thing', B: 'The front row heard', C: 'The proctor noticed', D: 'Now everyone is hungry', E: 'Louder than the exam',
      },
      blank: 'Brave Blank Sheet', blankCmt: 'Buy pencils the day before',
      teacherRare: 'The proctor growled louder',
      xText: (r) => `My tummy growled ${r.rumble} times in the exam. Covered ${r.safe}, caught ${r.bust}. "${r.rank}" #TummyRumbleExam`,
      subjects: ['Math', 'English', 'Literature', 'History', 'Chemistry'],
      board: 'EXAM', boardSub: 'Silence',
    },
  },
}
