const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const URL_TRUYEN_THONG = "https://wtx.tele68.com/v1/tx/sessions";
const URL_MD5 = "https://wtxmd52.tele68.com/v1/txmd5/sessions";

const HEADERS = {
"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
"Accept": "application/json, text/plain, */*",
"Referer": "https://tele68.com/",
"Origin": "https://tele68.com",
"Connection": "keep-alive"
};

const http = axios.create({ timeout: 10000, headers: HEADERS });

let historyNormal = [];
let historyMd5 = [];
let predictionsNormal = [];
let predictionsMd5 = [];

// ========== CHAOS MARKOV CHAIN - XÚC XẮC 1 2 3 SIÊU CHUẨN ==========
class MarkovXucXac123 {
    constructor(bac = 3) {
        this.bac = Math.min(4, Math.max(1, bac));
        this.transitions = new Map();
        this.history = [];
        this.maxHistory = 60;
    }

    // Chuyển xúc xắc (1-6) thành loại 1,2,3
    static chuyenLoai(diem) {
        if (diem === 1 || diem === 2) return 1;
        if (diem === 3 || diem === 4) return 2;
        return 3; // 5 hoặc 6
    }

    themDuLieu(daySo) {
        const filtered = daySo.map(x => {
            if (x === 1 || x === 2) return 1;
            if (x === 3 || x === 4) return 2;
            return 3;
        });
        this.history.push(...filtered);
        if (this.history.length > this.maxHistory) {
            this.history = this.history.slice(-this.maxHistory);
        }
        this._xayDungMaTran();
    }

    _xayDungMaTran() {
        this.transitions.clear();
        const len = this.history.length;
        if (len < this.bac + 1) return;

        for (let i = this.bac; i < len; i++) {
            // Tạo state từ bậc 1 đến bac
            for (let b = 1; b <= this.bac; b++) {
                const state = [];
                for (let j = b - 1; j >= 0; j--) {
                    state.push(this.history[i - j]);
                }
                const stateKey = state.join(',');
                const nextVal = this.history[i];
                
                if (!this.transitions.has(stateKey)) {
                    this.transitions.set(stateKey, new Map());
                }
                const nextMap = this.transitions.get(stateKey);
                nextMap.set(nextVal, (nextMap.get(nextVal) || 0) + 1);
            }
        }
    }

    _layStateHienTai() {
        if (this.history.length < 1) return null;
        const results = [];
        for (let b = 1; b <= this.bac; b++) {
            if (this.history.length >= b) {
                const state = [];
                for (let j = b - 1; j >= 0; j--) {
                    state.push(this.history[this.history.length - 1 - j]);
                }
                results.push({ bac: b, key: state.join(',') });
            }
        }
        return results;
    }

    duDoan() {
        if (this.history.length < 2) {
            return this._duDoanTheoXuatHuong();
        }

        const states = this._layStateHienTai();
        const diem = { 1: 0, 2: 0, 3: 0 };
        let tongDiem = 0;

        // Duyệt từ bậc cao xuống thấp, ưu tiên bậc cao hơn
        for (let i = states.length - 1; i >= 0; i--) {
            const s = states[i];
            const nextMap = this.transitions.get(s.key);
            if (nextMap && nextMap.size > 0) {
                const heSo = Math.pow(2, s.bac); // Bậc càng cao càng quan trọng
                for (let [val, count] of nextMap.entries()) {
                    diem[val] += count * heSo;
                    tongDiem += count * heSo;
                }
                break; // Chỉ lấy bậc cao nhất có dữ liệu
            }
        }

        if (tongDiem === 0) {
            return this._duDoanTheoXuatHuong();
        }

        // Random có trọng số
        let rand = Math.random() * tongDiem;
        let cum = 0;
        for (let val of [1, 2, 3]) {
            cum += diem[val];
            if (rand <= cum) return val;
        }
        return 2;
    }

    _duDoanTheoXuatHuong() {
        if (this.history.length === 0) return 2;
        const dem = { 1: 0, 2: 0, 3: 0 };
        this.history.forEach(v => dem[v]++);
        let maxVal = 2, maxCount = 0;
        for (let val of [1, 2, 3]) {
            if (dem[val] > maxCount) {
                maxCount = dem[val];
                maxVal = val;
            }
        }
        return maxVal;
    }

    phanTich() {
        if (this.history.length < 5) {
            return {
                prediction: "CHƯA ĐỦ MẪU",
                confidenceTai: 50,
                confidenceXiu: 50,
                reason: `Cần thêm ${8 - this.history.length} phiên`,
                duDoanSo: 2,
                doOnDinh: "THẤP"
            };
        }

        const duDoanSo = this.duDoan();
        const prediction = (duDoanSo === 1 || duDoanSo === 3) ? "TÀI" : "XỈU";
        
        // Tính độ tin cậy dựa trên lịch sử gần đây
        const recent = this.history.slice(-10);
        const recentDem = { 1: 0, 2: 0, 3: 0 };
        recent.forEach(v => recentDem[v]++);
        
        let confidence = 65;
        if (recentDem[duDoanSo] >= 5) confidence += 20;
        else if (recentDem[duDoanSo] >= 3) confidence += 10;
        else if (recentDem[duDoanSo] === 0) confidence -= 15;
        
        if (this.history.length > 30) confidence += 10;
        confidence = Math.min(95, Math.max(50, confidence));
        
        let confidenceTai = (duDoanSo === 1 || duDoanSo === 3) ? confidence : 100 - confidence;
        let confidenceXiu = (duDoanSo === 2) ? confidence : 100 - confidence;
        
        // Chuẩn hóa
        const total = confidenceTai + confidenceXiu;
        if (total !== 100) {
            confidenceTai = Math.round(confidenceTai * 100 / total);
            confidenceXiu = 100 - confidenceTai;
        }
        
        // Phân tích pattern
        let pattern = "";
        if (this.history.length >= 3) {
            const last3 = this.history.slice(-3);
            if (last3[0] === last3[1] && last3[1] === last3[2]) pattern = "CẦU BA THÔNG";
            else if (last3[0] !== last3[1] && last3[1] !== last3[2] && last3[0] !== last3[2]) pattern = "CẦU LỆCH";
            else pattern = "CẦU BÌNH THƯỜNG";
        }
        
        const reason = `Markov bậc ${this.bac} | ${this.history.length} phiên | Pattern: ${pattern} | Dự đoán loại ${duDoanSo} (${duDoanSo === 1 ? "1-2" : duDoanSo === 2 ? "3-4" : "5-6"}) → ${prediction}`;
        
        return {
            prediction: prediction,
            confidenceTai: confidenceTai,
            confidenceXiu: confidenceXiu,
            reason: reason,
            duDoanSo: duDoanSo,
            pattern: pattern,
            lichSuGanDay: this.history.slice(-10)
        };
    }
}

// Hàm phân tích trend từ lịch sử kết quả
function analyzeTrend(history) {
    if (!history || history.length === 0) {
        return {
            prediction: "TÀI",
            confidenceTai: 50,
            confidenceXiu: 50,
            reason: "Chưa có dữ liệu, đánh TÀI tạm",
            duDoanSo: 3
        };
    }
    
    // Chuyển lịch sử thành dãy số 1,2,3 dựa trên từng viên xúc xắc
    const dice123 = [];
    for (let i = 0; i < Math.min(history.length, 40); i++) {
        const item = history[i];
        if (item && item.dices && item.dices.length === 3) {
            for (let d of item.dices) {
                dice123.push(MarkovXucXac123.chuyenLoai(d));
            }
        }
    }
    
    if (dice123.length < 12) {
        return {
            prediction: "TÀI",
            confidenceTai: 55,
            confidenceXiu: 45,
            reason: `Chỉ có ${dice123.length} mẫu xúc xắc, dùng dự đoán cơ bản`,
            duDoanSo: 3
        };
    }
    
    const markov = new MarkovXucXac123(3);
    markov.themDuLieu(dice123.slice(-36));
    return markov.phanTich();
}
// ========== KẾT THÚC MARKOV ==========

function generateSeed(history, count = 8) {
    if (history.length < count) return null;
    const seedString = history.slice(0, count).map(item => item.dices ? item.dices.join('') : '').join('');
    if (!seedString) return null;
    return crypto.createHash('md5').update(seedString).digest('hex');
}

function randomDice(seed) {
    if (!seed) return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    const hash = crypto.createHash('md5').update(seed).digest('hex');
    const num1 = parseInt(hash.substring(0, 2), 16) % 6 + 1;
    const num2 = parseInt(hash.substring(2, 4), 16) % 6 + 1;
    const num3 = parseInt(hash.substring(4, 6), 16) % 6 + 1;
    return [num1, num2, num3];
}

function updatePrediction(storage, history) {
    if (history.length < 2) return;
    const latest = history[0];
    const existing = storage.find(p => p.phien === latest.id);
    if (existing) return;
    const ai = analyzeTrend(history);
    storage.push({
        phien: latest.id + 1,
        du_doan: ai.prediction,
        ket_qua: null,
        danh_gia: null,
        chi_tiet: ai
    });
}

function evaluate(storage, history) {
    storage.forEach(p => {
        if (p.ket_qua) return;
        const real = history.find(h => h.id === p.phien);
        if (!real) return;
        const sum = real.dices ? real.dices.reduce((a, b) => a + b, 0) : 0;
        const result = sum >= 11 ? "TÀI" : "XỈU";
        p.ket_qua = result;
        p.danh_gia = (p.du_doan === result) ? "THẮNG" : "THUA";
    });
}

function stats(storage) {
    const total = storage.length;
    const win = storage.filter(i => i.danh_gia === "THẮNG").length;
    const lose = storage.filter(i => i.danh_gia === "THUA").length;
    const rate = total === 0 ? 0 : ((win / total) * 100);
    return {
        tong_du_doan: total,
        tong_thang: win,
        tong_thua: lose,
        ti_le_chinh_xac: `${rate.toFixed(2)}%`,
        lich_su: storage.slice(-20)
    };
}

function formatData(raw, history) {
    const list = raw?.list;
    if (!list || list.length === 0) return { error: "Không có dữ liệu" };
    const data = list[0];
    const ai = analyzeTrend(list);
    const seed = generateSeed(list, 8);
    
    let tong = 0;
    let xuc_xac = [0, 0, 0];
    if (data.dices && data.dices.length === 3) {
        xuc_xac = data.dices;
        tong = data.dices.reduce((a, b) => a + b, 0);
    } else {
        const randomDices = randomDice(seed);
        xuc_xac = randomDices;
        tong = randomDices.reduce((a, b) => a + b, 0);
    }

    return {
        phien: data.id,
        xuc_xac_1: xuc_xac[0],
        xuc_xac_2: xuc_xac[1],
        xuc_xac_3: xuc_xac[2],
        tong: tong,
        ket_qua: tong >= 11 ? "TÀI" : "XỈU",
        phien_tiep_theo: data.id + 1,
        du_doan: ai.prediction,
        do_tin_cay: { TÀI: `${ai.confidenceTai}%`, XỈU: `${ai.confidenceXiu}%` },
        ly_do: ai.reason,
        du_doan_loai_xuc_xac: ai.duDoanSo,
        pattern: ai.pattern || "BÌNH THƯỜNG"
    };
}

async function fetchWithRetry(url, retry = 2) {
    try { return await http.get(url); }
    catch (e) { if (retry > 0) return fetchWithRetry(url, retry - 1); throw e; }
}

async function poll() {
    try {
        const [normal, md5] = await Promise.all([
            fetchWithRetry(URL_TRUYEN_THONG),
            fetchWithRetry(URL_MD5)
        ]);
        historyNormal = normal.data.list || [];
        historyMd5 = md5.data.list || [];
        updatePrediction(predictionsNormal, historyNormal);
        updatePrediction(predictionsMd5, historyMd5);
        evaluate(predictionsNormal, historyNormal);
        evaluate(predictionsMd5, historyMd5);
        console.log("🌊 Poll OK -", new Date().toLocaleTimeString());
    } catch (e) { console.log("Poll lỗi:", e.message); }
}
setInterval(poll, 5000);

app.get("/", (req, res) => res.send("CHAOS MARKOV - Tài Xỉu Siêu Chuẩn"));
app.get("/taixiu", async (req, res) => {
    try { const r = await fetchWithRetry(URL_TRUYEN_THONG); res.json(formatData(r.data, historyNormal)); }
    catch { res.status(500).json({ error: "API lỗi" }); }
});
app.get("/taixiumd5", async (req, res) => {
    try { const r = await fetchWithRetry(URL_MD5); res.json(formatData(r.data, historyMd5)); }
    catch { res.status(500).json({ error: "API lỗi" }); }
});
app.get("/all", async (req, res) => {
    try {
        const [a, b] = await Promise.all([fetchWithRetry(URL_TRUYEN_THONG), fetchWithRetry(URL_MD5)]);
        res.json({ taixiu: formatData(a.data, historyNormal), taixiumd5: formatData(b.data, historyMd5) });
    } catch { res.status(500).json({ error: "Lỗi" }); }
});
app.get("/thongke", (req, res) => res.json(stats(predictionsNormal)));
app.get("/thongkemd5", (req, res) => res.json(stats(predictionsMd5)));

app.listen(PORT, () => console.log(`🚀 Server chạy cổng ${PORT} - Địt mẹ Markov 1-2-3 ngon lồn`));
