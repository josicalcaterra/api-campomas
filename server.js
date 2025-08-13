const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

function safeJson(res, data) {
  res.json(data);
}

// ======================
// Dólar Oficial
// ======================
app.get('/api/dolar-oficial', async (req, res) => {
  try {
    const { data } = await axios.get('https://www.bna.com.ar/Cotizador/MonedasHistorico');
    const $ = cheerio.load(data);
    let compra = '';
    let venta = '';

    $('tbody tr').each((_, row) => {
      const nombre = $(row).find('td').eq(0).text().trim().toLowerCase();
      if (nombre.includes('dolar u.s.a')) {
        compra = $(row).find('td').eq(1).text().trim();
        venta = $(row).find('td').eq(2).text().trim();
      }
    });

    safeJson(res, { compra: compra || null, venta: venta || null, fuente: 'https://www.bna.com.ar/Cotizador/MonedasHistorico' });
  } catch (err) {
    console.error('Error Dólar Oficial:', err.message);
    safeJson(res, { compra: null, venta: null, fuente: null });
  }
});

// ======================
// Dólar Oficial - Día Anterior (hábil)
// ======================
app.get('/api/dolar-oficial-anterior', async (req, res) => {
  try {
    const hoy = new Date();
    const diaDeLaSemana = hoy.getDay();

    // Retroceder 1 o 3 días según si es lunes
    let fechaAnterior = new Date(hoy);
    fechaAnterior.setDate(hoy.getDate() - (diaDeLaSemana === 1 ? 3 : 1));

    const fechaUrl = `${String(fechaAnterior.getDate()).padStart(2, '0')}%2F${String(fechaAnterior.getMonth() + 1).padStart(2, '0')}%2F${fechaAnterior.getFullYear()}`;
    const url = `https://www.bna.com.ar/Cotizador/HistoricoPrincipales?id=monedas&fecha=${fechaUrl}&filtroEuro=0&filtroDolar=1`;

    const { data } = await axios.get(url, { httpsAgent });
    const $ = cheerio.load(data);

    let compra = null;
    let venta = null;

    // Lista de posibles tablas a buscar
    const tablas = [
      'table.table.cotizacion.monedaHistorico tbody tr',
      'div#cotizacionesCercanas table tbody tr'
    ];

    for (const selector of tablas) {
      $(selector).each((i, el) => {
        const moneda = $(el).find('td').eq(0).text().trim();
        const fechaTexto = $(el).find('td').eq(3).text().trim();

        if (moneda.includes('Dolar U.S.A') && fechaTexto) {
          const [d, m, a] = fechaTexto.split('/').map(Number);
          const fechaFila = new Date(a, m - 1, d);

          // Solo tomar fechas anteriores a hoy (día hábil más cercano)
          if (fechaFila < hoy) {
            compra = $(el).find('td').eq(1).text().trim();
            venta = $(el).find('td').eq(2).text().trim();
            return false; // rompe el each
          }
        }
      });
      if (compra && venta) break; // rompe el for si ya encontró
    }

    safeJson(res, { compra, venta, fuente: url });
  } catch (err) {
    console.error('Error Dólar Oficial Anterior:', err.message);
    safeJson(res, { compra: null, venta: null, fuente: null });
  }
});




// ======================
// Dólar Blue (con valor anterior)
// ======================
app.get('/api/dolar-blue', async (req, res) => {
  try {
    const { data } = await axios.get('https://dolarhoy.com/');
    const $ = cheerio.load(data);

    // Selector para el tile principal del Dólar Blue
    const blueTile = $('a[href*="dolar-blue"]').closest('.tile.is-child');
    
    // Extracción de los valores de compra y venta
    let compra = blueTile.find('.compra .val').text().trim();
    let venta = blueTile.find('.venta .val').text().trim();
    
    // Extracción del porcentaje de cambio del valor de venta
    let porcentajeText = blueTile.find('.venta .var-porcentaje').text().trim();
    
    let porcentaje = null;
    if (porcentajeText) {
        porcentaje = parseFloat(porcentajeText.replace(/[^\d.-]/g, ''));
    }

    safeJson(res, {
      compra: compra || null,
      venta: venta || null,
      porcentaje: porcentaje || null,
      fuente: 'https://dolarhoy.com/'
    });
  } catch (err) {
    console.error('Error Dólar Blue:', err.message);
    safeJson(res, { compra: null, venta: null, porcentaje: null, fuente: null });
  }
});

// ======================
// Granos (con fuentes separadas para disponible desde MatbaRofex)
// ======================

app.get('/api/granos', async (req, res) => {
  try {
    let disponible = {};
    let pizarra = {};

    try {
      const dispRes = await axios.get('https://www.ggsa.com.ar/get_disponible/', { httpsAgent });
      disponible = dispRes.data || {};
    } catch (e) {
      console.warn('Disponible no accesible hoy');
    }

    try {
      const pizRes = await axios.get('https://www.ggsa.com.ar/get_pizarra/', { httpsAgent });
      pizarra = (pizRes.data && pizRes.data.pizarra && pizRes.data.pizarra[0]) || {};
    } catch (e) {
      console.warn('Pizarra GGSA no accesible hoy');
    }

    safeJson(res, {
      soja: {
        disponible: disponible?.soja?.rosario || '$390.000',
        pizarra: pizarra?.soja?.rosario || 'Sin datos'
      },
      trigo: {
        disponible: disponible?.trigo?.rosario || 'u$s 202 c/desc',
        pizarra: pizarra?.trigo?.rosario || 'Sin datos'
      },
      maiz: {
        disponible: disponible?.maiz?.rosario || 'u$s 172 c/desc',
        pizarra: pizarra?.maiz?.rosario || 'Sin datos'
      },
      sorgo: {
        disponible: disponible?.sorgo?.rosario || 'u$s 175 c/desc',
        pizarra: pizarra?.sorgo?.rosario || 'Sin datos'
      },
      girasol: {
        disponible: disponible?.girasol?.rosario || 'u$s 202 c/desc',
        pizarra: pizarra?.girasol?.rosario || 'Sin datos'
      },
      fuente: 'https://www.ggsa.com.ar/#/cotizaciones'
    });
  } catch (err) {
    console.error('Error Granos:', err.message);
    safeJson(res, { error: 'Error obteniendo precios de granos' });
  }
});


// ======================
// Pizarra BCR con fecha
// ======================
app.get('/api/pizarra-bcr', async (req, res) => {
  const url = 'https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-0';
  try {
    const { data } = await axios.get(url, { httpsAgent });
    const $ = cheerio.load(data);
    const bodyText = $('body').text();
    const fechas = (bodyText.match(/\d{2}\/\d{2}\/\d{4}/g) || []).slice(0, 7);

    const grainNames = {
      soja: ['soja', 'soybean'],
      maiz: ['maíz', 'maiz', 'yellow corn'],
      trigo: ['trigo', 'wheat'],
      sorgo: ['sorgo', 'grain sorghum', 'sorghum'],
      girasol: ['girasol', 'sunseed']
    };

    const lowerRaw = bodyText.toLowerCase();
    const cotizaciones = { soja: [], maiz: [], trigo: [], sorgo: [], girasol: [] };

    function findFirstIndex(aliases) {
      let idx = -1;
      aliases.forEach(a => {
        const i = lowerRaw.indexOf(a.toLowerCase());
        if (i >= 0 && (idx === -1 || i < idx)) idx = i;
      });
      return idx;
    }

    const positions = {};
    Object.keys(grainNames).forEach(k => {
      positions[k] = findFirstIndex(grainNames[k]);
    });

    Object.keys(positions).forEach(key => {
      const start = positions[key];
      if (start === -1) {
        cotizaciones[key] = [];
        return;
      }
      let end = bodyText.length;
      Object.keys(positions).forEach(k2 => {
        if (k2 === key) return;
        const p = positions[k2];
        if (p > start && p < end) end = p;
      });
      const segment = bodyText.substring(start, end);
      const tokens = (segment.match(/[\d\.\,]+|S\/C/gi) || []).map(t => t.trim());
      const items = [];
      for (let i = 0; i < Math.min(tokens.length, Math.max(1, fechas.length)); i++) {
        const fecha = fechas[i] || `col${i+1}`;
        const precio = tokens[i];
        items.push({ fecha, precio });
      }
      cotizaciones[key] = items;
    });

    const fechaUltima = fechas.length > 0 ? fechas[0] : null;

    safeJson(res, { cotizaciones, fechaUltima, fuente: url });
  } catch (err) {
    console.error('Error Pizarra BCR:', err.message);
    safeJson(res, { cotizaciones: {}, fechaUltima: null, fuente: url });
  }
});

// ======================
// Clima
// ======================
app.get('/api/clima', async (req, res) => {
  try {
    const { data } = await axios.get('http://www.cocade.com.ar/ema/mb1.htm', { httpsAgent });
    const $ = cheerio.load(data);

    const temperaturaRaw = $('b span:contains("TEMPERATURA")').closest('table').find('tr').eq(1).find('table').find('tr').first().find('td').eq(1).text().trim();
    const temperatura = temperaturaRaw ? temperaturaRaw.replace(/[^\d.,\-]/g, '') + ' °C' : null;

    const humedadRaw = $('b span:contains("HUMEDAD")').closest('table').find('tr').eq(1).find('table').find('tr').first().find('td').eq(1).text().trim();
    const humedad = humedadRaw ? humedadRaw.replace(/[^\d.,\-]/g, '') + ' %' : null;

    const precipDiaRaw = $('b span:contains("LLUVIA")').closest('table').find('tr').eq(1).find('table').find('tr').eq(0).find('td').eq(1).text().trim();
    const precipDia = precipDiaRaw ? precipDiaRaw.replace(/\s+/g, '') : null;

    const intensidadRaw = $('b span:contains("LLUVIA")').closest('table').find('tr').eq(1).find('table').find('tr').eq(1).find('td').eq(1).text().trim();
    const intensidad = intensidadRaw ? intensidadRaw.replace(/\s+/g, '') : null;

    const precipMensualRaw = $('b span:contains("LLUVIA")').closest('table').find('tr').eq(1).find('table').find('tr').eq(2).find('td').eq(1).text().trim();
    const precipMensual = precipMensualRaw ? precipMensualRaw.replace(/\s+/g, '') : null;

    const fechaText = $('p:contains("FECHA:")').text().trim();
    const horaText = $('p:contains("HORA:")').text().trim();

    const fecha = fechaText.split(' ')[1];
    const hora = horaText.split(' ')[1];

    safeJson(res, { 
      temperatura, 
      humedad, 
      precipDia, 
      intensidad, 
      precipMensual, 
      fecha, 
      hora, 
      fuente: 'http://www.cocade.com.ar/ema/mb1.htm' 
    });
  } catch (err) {
    console.error('Error clima:', err.message);
    safeJson(res, { temperatura: null, humedad: null, precipDia: null, intensidad: null, precipMensual: null, fecha: null, hora: null, fuente: null });
  }
});

// Exporta la aplicación para que Vercel pueda usarla
module.exports = app;
