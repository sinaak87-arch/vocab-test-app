import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Printer,
  Eye,
  EyeOff,
  Shuffle,
  BookOpen,
  Check,
  AlertCircle,
  Sparkles,
  Layers,
  Download,
  RefreshCw,
  FileUp,
} from 'lucide-react';

const STORAGE_KEY = 'vocab_test_maker_v4';
const ACADEMY_NAME = 'GIANTS';

// 파일명에서 확장자 제거
function getFileBaseName(filename) {
  if (!filename) return '';
  return filename.replace(/\.(xlsx|xls|csv)$/i, '').trim();
}

// 파일명/PDF에 쓸 수 없는 문자 제거 (Windows/Mac 모두 안전)
function sanitizeForFilename(s) {
  if (!s) return '';
  return String(s).replace(/[\\/:*?"<>|]/g, '_').trim();
}

// 단원 배열을 정렬 (숫자 우선, 없으면 문자열 비교)
// 단원 값에서 숫자 부분 추출 (예: "Day 01" → 1, "단원 19" → 19, "19" → 19)
function extractUnitNumber(unit) {
  if (unit === null || unit === undefined) return null;
  const str = String(unit).trim();
  // 문자열에서 첫 번째 숫자 그룹 추출
  const match = str.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? null : num;
  }
  return null;
}

// 단원 배열을 정렬 (숫자 부분 추출해서 정렬, 없으면 문자열 비교)
function sortUnits(arr) {
  return [...arr].sort((a, b) => {
    const na = extractUnitNumber(a);
    const nb = extractUnitNumber(b);
    // 둘 다 숫자가 있으면 숫자로 비교
    if (na !== null && nb !== null) return na - nb;
    // 한쪽만 숫자면 숫자가 앞으로
    if (na !== null) return -1;
    if (nb !== null) return 1;
    // 둘 다 문자열이면 문자열 비교
    return String(a).localeCompare(String(b));
  });
}

// 선택된 단원으로부터 시험지명 자동 생성
function buildTestTitleFromUnits(selected, allUnits) {
  if (!selected || selected.size === 0) return '';
  const sorted = sortUnits([...selected]);
  if (sorted.length === 1) return `${sorted[0]}`;

  // 모든 단원이 선택됐을 때
  if (sorted.length === allUnits.length) {
    return `${sorted[0]}~${sorted[sorted.length - 1]} (전체)`;
  }

  return `${sorted[0]}~${sorted[sorted.length - 1]}`;
}

export default function App() {
  const [words, setWords] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedUnits, setSelectedUnits] = useState(new Set());
  const [questionCount, setQuestionCount] = useState(20);
  const [testType, setTestType] = useState('eng-kor');
  const [generatedTest, setGeneratedTest] = useState(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [className, setClassName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [testTitle, setTestTitle] = useState('');
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [previewZoom, setPreviewZoom] = useState(50); // 미리보기 화면 비율 (%)
  const [lastClickedUnit, setLastClickedUnit] = useState(null); // Shift 클릭 범위 선택용

  // 사용자가 직접 수정했는지 추적 (직접 수정한 경우 자동값 덮어쓰지 않음)
  const [classNameTouched, setClassNameTouched] = useState(false);
  const [testTitleTouched, setTestTitleTouched] = useState(false);

  const fileInputRef = useRef(null);

  // 선택된 단원이 바뀔 때마다 시험지명 자동 업데이트 (사용자가 수정 안 한 경우만)
  useEffect(() => {
    if (testTitleTouched) return;
    if (units.length === 0) {
      setTestTitle('');
      return;
    }
    const auto = buildTestTitleFromUnits(selectedUnits, units);
    setTestTitle(auto);
  }, [selectedUnits, units, testTitleTouched]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setErrorMsg('');
    setFileName(file.name);

    // 클래스명을 파일명으로 자동 설정 (사용자가 수정한 적 없을 때만)
    const baseName = getFileBaseName(file.name);
    if (!classNameTouched) {
      setClassName(baseName);
    }

    // 새 파일 업로드 시 시험지명 자동 갱신을 위해 touched 상태 리셋
    setTestTitleTouched(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        const parsed = [];
        rows.forEach((row) => {
          if (!row || row.length < 3) return;
          const unit = row[0];
          const eng = row[1];
          const kor = row[2];
          if (unit !== null && unit !== undefined && eng && kor) {
            // 단원 값에서 모든 공백 문자(일반 공백, 탭, 줄바꿈, NBSP 등) 정규화
            const cleanUnit = String(unit).replace(/\s+/g, ' ').trim();
            parsed.push({
              unit: cleanUnit,
              eng: String(eng).trim(),
              kor: String(kor).trim(),
            });
          }
        });

        if (parsed.length === 0) {
          setErrorMsg(
            '엑셀 파일에서 단어를 찾을 수 없습니다. A열: 단원, B열: 영어, C열: 한글뜻 형식인지 확인해주세요.'
          );
          return;
        }

        const uniqueUnits = sortUnits([...new Set(parsed.map((w) => w.unit))]);

        setWords(parsed);
        setUnits(uniqueUnits);
        setSelectedUnits(new Set()); // 기본값: 선택 없음 (사용자가 직접 선택)
        setGeneratedTest(null);
      } catch (err) {
        setErrorMsg('파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 단원 클릭 처리 - Shift 클릭으로 범위 선택 지원
  const handleUnitClick = (unit, event) => {
    const shiftKey = event?.shiftKey;
    const ctrlOrCmd = event?.ctrlKey || event?.metaKey;

    // Shift + 클릭: 마지막 클릭 단원 ~ 현재 클릭 단원 사이 모두 선택
    if (shiftKey && lastClickedUnit !== null && lastClickedUnit !== unit) {
      const startIdx = units.indexOf(lastClickedUnit);
      const endIdx = units.indexOf(unit);
      if (startIdx === -1 || endIdx === -1) {
        // 못 찾으면 일반 토글로 처리
        toggleUnit(unit);
        setLastClickedUnit(unit);
        return;
      }
      const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      const next = new Set(selectedUnits);
      // 범위 안의 모든 단원을 선택 (해제하지 않고 추가)
      for (let i = from; i <= to; i++) {
        next.add(units[i]);
      }
      setSelectedUnits(next);
      setLastClickedUnit(unit);
      return;
    }

    // 일반 클릭 또는 Ctrl/Cmd + 클릭: 단일 토글
    toggleUnit(unit);
    setLastClickedUnit(unit);
  };

  const toggleUnit = (unit) => {
    const next = new Set(selectedUnits);
    if (next.has(unit)) next.delete(unit);
    else next.add(unit);
    setSelectedUnits(next);
  };

  const toggleAllUnits = () => {
    if (selectedUnits.size === units.length) setSelectedUnits(new Set());
    else setSelectedUnits(new Set(units));
  };

  const availableWords = useMemo(() => {
    return words.filter((w) => selectedUnits.has(w.unit));
  }, [words, selectedUnits]);

  // 단원별 단어 수
  const unitCounts = useMemo(() => {
    const map = {};
    units.forEach((u) => {
      map[u] = words.filter((w) => w.unit === u).length;
    });
    return map;
  }, [words, units]);

  const generateTest = () => {
    setErrorMsg('');
    if (words.length === 0) {
      setErrorMsg('먼저 엑셀 파일을 업로드해주세요.');
      return;
    }
    if (selectedUnits.size === 0) {
      setErrorMsg('출제 범위(단원)를 1개 이상 선택해주세요.');
      return;
    }
    if (availableWords.length === 0) {
      setErrorMsg('선택한 범위에 단어가 없습니다.');
      return;
    }
    const count = Math.min(questionCount, availableWords.length);
    const arr = [...availableWords];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setGeneratedTest({
      items: arr.slice(0, count),
      type: testType,
      createdAt: new Date(),
    });
    setShowAnswers(false);
    setTimeout(() => {
      document
        .getElementById('test-preview')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const reshuffle = () => {
    if (!generatedTest) return;
    const arr = [...generatedTest.items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setGeneratedTest({ ...generatedTest, items: arr });
  };

  // 시험지만 지우고 STEP 02로 돌아가기 (파일/단원 선택 유지)
  const handleResetTest = () => {
    setGeneratedTest(null);
    setShowAnswers(false);
    // STEP 02 영역으로 부드럽게 스크롤
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  // 새 파일로 완전 초기화 (모든 데이터 리셋)
  const handleResetAll = () => {
    const confirmReset = window.confirm(
      '⚠️ 모든 설정을 초기화하고 처음부터 다시 시작합니다.\n\n' +
      '· 업로드한 파일 정보가 사라집니다\n' +
      '· 선택한 단원이 모두 해제됩니다\n' +
      '· 만든 시험지가 사라집니다\n\n' +
      '계속 진행하시겠습니까?'
    );
    if (!confirmReset) return;

    setWords([]);
    setUnits([]);
    setSelectedUnits(new Set());
    setQuestionCount(20);
    setTestType('eng-kor');
    setGeneratedTest(null);
    setShowAnswers(false);
    setClassName('');
    setStudentName('');
    setTestTitle('');
    setFileName('');
    setErrorMsg('');
    setClassNameTouched(false);
    setTestTitleTouched(false);
    setLastClickedUnit(null);

    // 파일 input 초기화 (같은 파일을 다시 선택할 수 있도록)
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // 페이지 최상단으로 스크롤
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handlePrint = () => window.print();

  // PDF 저장: 브라우저 인쇄 대화상자에서 "PDF로 저장" 선택
  // 파일명을 임시로 변경해서 PDF 저장 시 기본 파일명이 되도록 함
  const handleSaveAsPDF = () => {
    if (!generatedTest) return;

    const cls = sanitizeForFilename(className) || 'class';
    const range = sanitizeForFilename(testTitle) || 'range';
    const suffix = showAnswers ? '_정답' : '';
    const newTitle = `VOCATEST_${cls}_${range}${suffix}`;
    const originalTitle = document.title;
    document.title = newTitle;
    // 인쇄 대화상자가 닫힌 후 원래 타이틀 복원
    const restore = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    // 살짝 지연을 두고 호출하면 일부 브라우저에서 더 안정적
    setTimeout(() => window.print(), 50);
  };

  const selectedRangeLabel = useMemo(() => {
    if (selectedUnits.size === 0) return '범위 미선택';
    if (selectedUnits.size === units.length) return '전체 단원';
    const sorted = sortUnits([...selectedUnits]);
    if (sorted.length <= 4) return sorted.map((u) => `${u}`).join(', ');
    return `${sorted[0]} 외 ${sorted.length - 1}개 단원`;
  }, [selectedUnits, units]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Nanum+Myeongjo:wght@400;700;800&display=swap');
        @media print {
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          @page {
            margin: 0.7cm 0.6cm;
            size: A4 portrait;
          }
          /* 인쇄 시 시험지 페이지를 A4 사용 영역에 안전하게 고정
             A4 = 21cm × 29.7cm, @page margin 0.7cm/0.6cm = 사용 영역 19.8cm × 28.3cm
             높이는 28.0cm로 살짝 여유를 둬서 빈 페이지가 추가되지 않도록 함 */
          .print-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 28.0cm !important;
            max-height: 28.0cm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
          }
          .print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .test-items-grid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            flex: 1 1 auto !important;
          }
          .test-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* 인쇄 시 문항 영역이 페이지를 꽉 채우도록 grid 1fr이 작동하게 함 */
          .print-page .test-items-grid {
            flex: 1 1 auto !important;
            grid-auto-rows: 1fr !important;
            align-content: stretch !important;
          }
          /* 인쇄 시 각 문항 패딩을 줄여 40개가 안전하게 한 페이지에 들어가도록 */
          .print-page .test-item {
            padding-top: 2px !important;
            padding-bottom: 2px !important;
          }
        }
        .print-only { display: none; }
        .test-line { border-bottom: 1px solid #1c1917; min-height: 1.1rem; }
        kbd {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          box-shadow: 0 1px 0 rgba(0,0,0,0.08);
        }
      `}</style>

      <header className="no-print bg-gradient-to-r from-violet-700 via-purple-700 to-fuchsia-700 text-white">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <BookOpen className="w-6 h-6" strokeWidth={2.2} />
            </div>
            <div>
              <h1
                className="text-2xl font-black tracking-tight"
                style={{ fontFamily: "'Nanum Myeongjo', serif" }}
              >
                GIANTS 어휘 출제기
              </h1>
              <p className="text-xs text-violet-100/80 mt-0.5">
                엑셀 파일로 만드는 단어 시험지
              </p>
            </div>
          </div>
          {words.length > 0 && (
            <div className="hidden md:flex items-center gap-2 text-xs bg-white/10 px-3 py-1.5 rounded-full">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {words.length}개 단어 · {units.length}개 단원
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="no-print max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* STEP 01 - 엑셀 업로드 */}
        <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-3 border-b border-stone-200 flex items-center gap-3">
            <span className="bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded">
              STEP 01
            </span>
            <h2 className="font-bold text-stone-800">엑셀 파일 업로드</h2>
            <span className="text-xs text-stone-500 ml-auto hidden sm:inline">
              A열: 단원 · B열: 영어 · C열: 한글뜻
            </span>
          </div>
          <div className="p-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-stone-300 hover:border-violet-400 hover:bg-violet-50/40 rounded-xl p-8 text-center cursor-pointer transition-all"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              {fileName ? (
                <div className="flex items-center justify-center gap-3 text-stone-700">
                  <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                  <div className="text-left">
                    <div className="font-bold text-emerald-700 flex items-center gap-1.5">
                      <Check className="w-4 h-4" /> {fileName}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {words.length}개 단어 · {units.length}개 단원 · 클릭해서 다른 파일로 변경
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 mx-auto text-stone-400 mb-3" />
                  <p className="font-bold text-stone-700">엑셀 파일을 클릭해서 업로드하세요</p>
                  <p className="text-xs text-stone-500 mt-1">.xlsx 또는 .xls 형식 지원</p>
                </>
              )}
            </div>

            {errorMsg && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 단원 정보 한눈에 보기 (업로드 후 표시) */}
            {words.length > 0 && (
              <div className="mt-4 bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-4 h-4 text-violet-700" />
                  <h3 className="font-bold text-violet-900 text-sm">
                    이 파일의 단원 구성
                  </h3>
                  <span className="text-xs text-violet-700 ml-auto">
                    범위: <strong>{units[0]} ~ {units[units.length - 1]}</strong> · 총 {units.length}개 단원
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {units.map((u) => (
                    <div
                      key={u}
                      className="bg-white border border-violet-200 rounded-md px-2.5 py-1 text-xs flex items-center gap-1.5"
                    >
                      <span className="font-bold text-violet-900">{u}</span>
                      <span className="text-stone-400">·</span>
                      <span className="text-stone-600">{unitCounts[u]}개</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 시트 형식 안내 (접힌 상태) */}
            {words.length === 0 && (
              <details className="mt-4 text-xs text-stone-500">
                <summary className="cursor-pointer font-medium hover:text-stone-700">
                  💡 엑셀 형식 안내 (클릭해서 펼치기)
                </summary>
                <div className="mt-3 bg-stone-50 rounded-lg p-4 space-y-2">
                  <p>
                    <strong className="text-stone-700">파일 형식:</strong> 첫 행부터 바로 데이터
                    입력 (헤더 행 없이)
                  </p>
                  <table className="text-xs border border-stone-200 mt-2">
                    <thead className="bg-stone-100">
                      <tr>
                        <th className="px-3 py-1 border-r border-stone-200">A열 (단원)</th>
                        <th className="px-3 py-1 border-r border-stone-200">B열 (영어)</th>
                        <th className="px-3 py-1">C열 (한글뜻)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-3 py-1 border-t border-r border-stone-200">19</td>
                        <td className="px-3 py-1 border-t border-r border-stone-200">damp</td>
                        <td className="px-3 py-1 border-t border-stone-200">습기 찬</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-1 border-t border-r border-stone-200">19</td>
                        <td className="px-3 py-1 border-t border-r border-stone-200">thick</td>
                        <td className="px-3 py-1 border-t border-stone-200">짙은</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-1 border-t border-r border-stone-200">20</td>
                        <td className="px-3 py-1 border-t border-r border-stone-200">improve</td>
                        <td className="px-3 py-1 border-t border-stone-200">개선하다</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        </section>

        {/* STEP 02 - 출제 옵션 */}
        {words.length > 0 && (
          <section className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
            <div className="bg-gradient-to-r from-violet-50 to-fuchsia-50 px-6 py-3 border-b border-stone-200 flex items-center gap-3">
              <span className="bg-violet-600 text-white text-xs font-bold px-2.5 py-1 rounded">
                STEP 02
              </span>
              <h2 className="font-bold text-stone-800">출제 범위 / 옵션 선택</h2>
            </div>

            <div className="p-6 grid md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-sm font-bold text-stone-700">
                      📚 시험 범위
                    </label>
                    <span className="text-[11px] text-stone-500 flex items-center gap-1">
                      <span className="inline-block w-3 h-3 bg-violet-600 rounded-sm"></span>
                      선택됨
                      <span className="inline-block w-3 h-3 bg-white border border-stone-300 rounded-sm ml-1.5"></span>
                      미선택
                    </span>
                  </div>
                  <button
                    onClick={toggleAllUnits}
                    className="text-xs text-violet-600 hover:text-violet-800 font-medium whitespace-nowrap"
                  >
                    {selectedUnits.size === units.length ? '전체 해제' : '전체 선택'}
                  </button>
                </div>
                <div className="text-[11px] text-stone-500 mb-2 bg-violet-50 border border-violet-100 rounded px-2.5 py-1.5">
                  💡 <kbd className="bg-white border border-stone-300 rounded px-1.5 py-0.5 text-[10px] font-mono mx-0.5">클릭</kbd> 단일 선택 ·
                  <kbd className="bg-white border border-stone-300 rounded px-1.5 py-0.5 text-[10px] font-mono mx-0.5">Shift</kbd>
                  <span className="mx-0.5">+</span>
                  <kbd className="bg-white border border-stone-300 rounded px-1.5 py-0.5 text-[10px] font-mono mx-0.5">클릭</kbd>
                  으로 시작~끝 범위 선택
                </div>
                <div className="border border-stone-200 rounded-xl p-3 max-h-60 overflow-y-auto bg-stone-50/50">
                  <div className="grid grid-cols-5 gap-2">
                    {units.map((unit) => {
                      const checked = selectedUnits.has(unit);
                      const cnt = unitCounts[unit];
                      return (
                        <button
                          key={unit}
                          onClick={(e) => handleUnitClick(unit, e)}
                          className={`px-2 py-2 rounded-lg border text-sm font-medium transition-all ${
                            checked
                              ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
                              : 'bg-white border-stone-200 text-stone-700 hover:border-violet-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span>{unit}</span>
                            <span
                              className={`text-[10px] ${
                                checked ? 'text-violet-100' : 'text-stone-400'
                              }`}
                            >
                              {cnt}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-stone-500 mt-2">
                  선택된 범위:{' '}
                  <span className="font-semibold text-violet-700">{selectedRangeLabel}</span>
                  {' · '}
                  <span className="font-semibold text-stone-700">
                    {availableWords.length}개 단어 사용 가능
                  </span>
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="text-sm font-bold text-stone-700 block mb-2">
                    🎯 출제 단어 개수
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQuestionCount(Math.max(1, questionCount - 5))}
                      className="w-9 h-9 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={questionCount}
                      onChange={(e) =>
                        setQuestionCount(Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="flex-1 text-center text-lg font-bold border border-stone-300 rounded-lg py-1.5 focus:outline-none focus:border-violet-500"
                      min={1}
                      max={availableWords.length}
                    />
                    <button
                      onClick={() =>
                        setQuestionCount(Math.min(availableWords.length, questionCount + 5))
                      }
                      className="w-9 h-9 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setQuestionCount(availableWords.length)}
                      className="px-3 h-9 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-bold"
                    >
                      MAX
                    </button>
                  </div>
                  <p className="text-xs text-stone-500 mt-1.5">
                    최대 {availableWords.length}개까지 출제 가능
                    {questionCount > 0 && (
                      <span className="ml-2 text-violet-600 font-medium">
                        · 예상 {Math.ceil(questionCount / 40)}페이지
                        {questionCount > 40 && ` (페이지당 40문항)`}
                      </span>
                    )}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-bold text-stone-700 block mb-2">
                    🔄 출제 유형
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setTestType('eng-kor')}
                      className={`px-4 py-3 rounded-xl border-2 transition-all ${
                        testType === 'eng-kor'
                          ? 'bg-violet-50 border-violet-500 text-violet-900'
                          : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
                      }`}
                    >
                      <div className="font-bold text-sm">영어 → 한글</div>
                      <div className="text-[11px] mt-0.5 opacity-70">영단어를 보고 뜻 쓰기</div>
                    </button>
                    <button
                      onClick={() => setTestType('kor-eng')}
                      className={`px-4 py-3 rounded-xl border-2 transition-all ${
                        testType === 'kor-eng'
                          ? 'bg-violet-50 border-violet-500 text-violet-900'
                          : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300'
                      }`}
                    >
                      <div className="font-bold text-sm">한글 → 영어</div>
                      <div className="text-[11px] mt-0.5 opacity-70">뜻을 보고 영단어 쓰기</div>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-stone-50/60 px-6 py-5 border-t border-stone-100">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-bold text-stone-700">
                  📝 시험지 정보
                </label>
                <span className="text-[11px] text-stone-500">
                  ✨ 단원명 = 파일명, 범위 = 시험 범위에서 자동 적용
                </span>
              </div>

              {/* 학원명 고정 표시 */}
              <div className="mb-3 flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                <span className="text-[10px] text-violet-700 font-bold">학원명</span>
                <span className="text-sm font-bold text-violet-900">{ACADEMY_NAME}</span>
                <span className="text-[10px] text-violet-500 ml-auto">고정</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-stone-500 block mb-1">
                    단원명{' '}
                    {!classNameTouched && className && (
                      <span className="text-violet-600">· 자동</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={className}
                    onChange={(e) => {
                      setClassName(e.target.value);
                      setClassNameTouched(true);
                    }}
                    placeholder="단원명"
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-violet-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-500 block mb-1">학생 이름</label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="비워두면 빈칸"
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:border-violet-400"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 pt-4">
              <button
                onClick={generateTest}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                시험지 만들기
              </button>
            </div>
          </section>
        )}

        {/* STEP 03 - 미리보기 */}
        {generatedTest && (
          <section
            id="test-preview"
            className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm"
          >
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-3 border-b border-stone-200 flex items-center gap-3 flex-wrap">
              <span className="bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded">
                STEP 03
              </span>
              <h2 className="font-bold text-stone-800">미리보기 & 인쇄</h2>
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowAnswers(!showAnswers)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-stone-200 hover:border-stone-300 text-sm font-medium flex items-center gap-1.5"
                >
                  {showAnswers ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showAnswers ? '정답 숨기기' : '정답 보기'}
                </button>
                <button
                  onClick={reshuffle}
                  className="px-3 py-1.5 rounded-lg bg-white border border-stone-200 hover:border-stone-300 text-sm font-medium flex items-center gap-1.5"
                >
                  <Shuffle className="w-4 h-4" /> 순서 섞기
                </button>
                <button
                  onClick={handleSaveAsPDF}
                  className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold flex items-center gap-1.5"
                  title="인쇄 대화상자에서 [PDF로 저장]을 선택해주세요"
                >
                  <Download className="w-4 h-4" /> PDF 저장
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> 인쇄하기
                </button>
                {/* 구분선 */}
                <span className="hidden sm:inline-block w-px h-6 bg-stone-300 mx-1"></span>
                <button
                  onClick={handleResetTest}
                  className="px-3 py-1.5 rounded-lg bg-white border border-stone-200 hover:border-violet-300 hover:bg-violet-50 text-sm font-medium flex items-center gap-1.5"
                  title="시험지를 지우고 STEP 02로 돌아가서 다른 조건으로 다시 만들기"
                >
                  <RefreshCw className="w-4 h-4" /> 다시 만들기
                </button>
                <button
                  onClick={handleResetAll}
                  className="px-3 py-1.5 rounded-lg bg-white border border-stone-200 hover:border-blue-300 hover:bg-blue-50 text-sm font-medium flex items-center gap-1.5 text-blue-700"
                  title="모든 설정을 초기화하고 새 엑셀 파일로 시작하기"
                >
                  <FileUp className="w-4 h-4" /> 새 파일
                </button>
              </div>
            </div>

            {/* 줌 컨트롤 */}
            <div className="bg-violet-50 px-6 py-2.5 border-b border-violet-100 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-violet-800">🔍 미리보기 크기</span>
              <button
                onClick={() => setPreviewZoom(Math.max(25, previewZoom - 5))}
                className="w-7 h-7 rounded bg-white hover:bg-violet-100 text-sm font-bold border border-violet-200"
                title="축소"
              >
                −
              </button>
              <input
                type="range"
                min="25"
                max="100"
                step="5"
                value={previewZoom}
                onChange={(e) => setPreviewZoom(parseInt(e.target.value))}
                className="flex-1 max-w-xs accent-violet-600"
              />
              <button
                onClick={() => setPreviewZoom(Math.min(100, previewZoom + 5))}
                className="w-7 h-7 rounded bg-white hover:bg-violet-100 text-sm font-bold border border-violet-200"
                title="확대"
              >
                +
              </button>
              <span className="text-sm font-bold text-violet-700 min-w-[3rem]">
                {previewZoom}%
              </span>
              <div className="flex items-center gap-1 ml-2">
                {[25, 40, 50, 70, 100].map((z) => (
                  <button
                    key={z}
                    onClick={() => setPreviewZoom(z)}
                    className={`px-2 py-0.5 text-xs rounded font-medium ${
                      previewZoom === z
                        ? 'bg-violet-600 text-white'
                        : 'bg-white hover:bg-violet-100 text-stone-700 border border-violet-200'
                    }`}
                  >
                    {z === 100 ? '실제' : `${z}%`}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-stone-500 ml-auto hidden md:inline">
                ⓘ 인쇄/PDF는 항상 실제 A4 크기로 출력됩니다
              </span>
            </div>

            <div className="p-6 bg-stone-100">
              {/* 줌 적용 래퍼 */}
              <div
                style={{
                  transform: `scale(${previewZoom / 100})`,
                  transformOrigin: 'top center',
                  width: `${10000 / previewZoom}%`,
                  marginLeft: `${-(10000 / previewZoom - 100) / 2}%`,
                }}
              >
                <TestPaper
                  test={generatedTest}
                  showAnswers={showAnswers}
                  academyName={ACADEMY_NAME}
                  className={className}
                  studentName={studentName}
                  testTitle={testTitle}
                  selectedRangeLabel={selectedRangeLabel}
                />
              </div>
            </div>
          </section>
        )}

        {words.length === 0 && (
          <div className="text-center py-12 text-stone-500 text-sm">
            <p>👆 위에서 엑셀 파일을 업로드하면 시작할 수 있어요.</p>
            <p className="mt-1 text-xs text-stone-400">
              파일 형식: A열에 단원번호, B열에 영어 단어, C열에 한글 뜻
            </p>
          </div>
        )}
      </main>

      {generatedTest && (
        <div className="print-only">
          <TestPaper
            test={generatedTest}
            showAnswers={showAnswers}
            academyName={ACADEMY_NAME}
            className={className}
            studentName={studentName}
            testTitle={testTitle}
            selectedRangeLabel={selectedRangeLabel}
            isPrint
          />
        </div>
      )}
    </div>
  );
}

function TestPaper({
  test,
  showAnswers,
  academyName,
  className,
  studentName,
  testTitle,
  selectedRangeLabel,
  isPrint,
}) {
  const isEngKor = test.type === 'eng-kor';
  const ITEMS_PER_PAGE = 40; // 한 페이지당 문항 수 (2단 × 20행)

  // 문항을 페이지 단위로 분할
  const pages = [];
  for (let i = 0; i < test.items.length; i += ITEMS_PER_PAGE) {
    pages.push(test.items.slice(i, i + ITEMS_PER_PAGE));
  }

  return (
    <div
      className={isPrint ? '' : 'mx-auto space-y-6'}
      style={{ fontFamily: "'Noto Sans KR', sans-serif" }}
    >
      {pages.map((pageItems, pageIdx) => {
        const startNum = pageIdx * ITEMS_PER_PAGE + 1;
        const isFirstPage = pageIdx === 0;

        return (
          <div
            key={pageIdx}
            className={`print-page bg-white ${
              isPrint ? '' : 'shadow-lg rounded-lg'
            }`}
            style={{
              // A4 = 21cm × 29.7cm, @page margin 1cm/0.7cm 적용 시 사용 영역 = 19.6cm × 27.7cm
              // 미리보기와 인쇄 모두 동일한 영역 사용
              ...(isPrint
                ? {
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0',
                    display: 'flex',
                    flexDirection: 'column',
                  }
                : {
                    // 미리보기: A4 전체 크기(21cm × 29.7cm) + @page margin과 동일한 padding
                    // 이렇게 해야 인쇄/PDF와 미리보기 결과가 동일하게 보임
                    width: '21cm',
                    height: '29.7cm',
                    maxHeight: '29.7cm',
                    overflow: 'hidden',
                    padding: '0.7cm 0.6cm',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }),
            }}
          >
            {/* 페이지 헤더 - 컴팩트 */}
            <div className="border-b-2 border-stone-900 pb-2 mb-3">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <div className="text-[9px] text-stone-500 mb-0.5">
                    VOCABULARY TEST
                    {pages.length > 1 && (
                      <span className="ml-2">
                        · Page {pageIdx + 1} / {pages.length}
                      </span>
                    )}
                  </div>
                  <h1
                    className="text-lg font-black text-stone-900 leading-tight"
                    style={{ fontFamily: "'Nanum Myeongjo', serif" }}
                  >
                    {testTitle || `어휘 시험 (${selectedRangeLabel})`}
                  </h1>
                  {isFirstPage && (
                    <div className="text-[11px] text-stone-600 mt-0.5">
                      {isEngKor
                        ? '※ 다음 영어 단어의 우리말 뜻을 쓰시오.'
                        : '※ 다음 우리말에 해당하는 영어 단어를 쓰시오.'}
                    </div>
                  )}
                  {!isFirstPage && (
                    <div className="text-[10px] text-stone-500 mt-0.5">(이어서)</div>
                  )}
                </div>
                <div className="text-[10px] text-stone-700 border border-stone-300 rounded p-1.5 min-w-[140px]">
                  {academyName && (
                    <div className="pb-0.5 border-b border-stone-200 mb-0.5">
                      <span className="text-stone-500 mr-1">학원</span>
                      {academyName}
                    </div>
                  )}
                  {className && (
                    <div className="pb-0.5 border-b border-stone-200 mb-0.5">
                      <span className="text-stone-500 mr-1">단원</span>
                      <span className="text-[9px]">{className}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-stone-500 mr-1">이름</span>
                    {studentName || '_____________'}
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center mt-1 text-[9px] text-stone-500">
                <span>
                  총 {test.items.length}문항 · {isEngKor ? '영어→한글' : '한글→영어'}
                </span>
                {isFirstPage && <span>점수:        / {test.items.length}</span>}
              </div>
            </div>

            {/* 문항 영역 - 2단 × 20행 = 40문항, 페이지를 꽉 채우도록 균등 분배 */}
            <div
              className="test-items-grid grid grid-cols-2 gap-x-6"
              style={{
                flex: '1 1 auto',
                gridAutoRows: '1fr', // 모든 행을 동일한 높이로
                alignContent: 'stretch',
              }}
            >
              {pageItems.map((item, i) => {
                const question = isEngKor ? item.eng : item.kor;
                const answer = isEngKor ? item.kor : item.eng;
                const num = startNum + i;
                return (
                  <div
                    key={i}
                    className="test-item flex items-baseline gap-1.5"
                    style={{
                      paddingTop: '4px',
                      paddingBottom: '4px',
                    }}
                  >
                    <span className="font-bold text-stone-700 w-6 text-right text-[12px] flex-shrink-0">
                      {num}.
                    </span>
                    <div className="flex-1 min-w-0 flex flex-col justify-center h-full">
                      <div className="font-medium text-stone-900 text-[12px] leading-tight truncate">
                        {question}
                      </div>
                      <div
                        className={`test-line text-[11px] ${
                          showAnswers ? 'text-red-600 font-medium' : ''
                        }`}
                        style={{ minHeight: '1.1rem', marginTop: '2px' }}
                      >
                        {showAnswers ? answer : '\u00A0'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 페이지 푸터 - 페이지 번호만 */}
            <div className="mt-2 text-[9px] text-stone-400 text-center">
              {pageIdx + 1} / {pages.length}
            </div>
          </div>
        );
      })}
    </div>
  );
}
