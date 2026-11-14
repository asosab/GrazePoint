// servicios/fieldShift/services/informe.js — informe PDF por predio.
//
// PDFKit, una página por predio más una por parcela con análisis:
// ficha, suelo (último PRIAS), siembra actual e historial, aforos,
// recomendación de rotación (top-3) y ventana de siembra forrajera.
// El PDF es la salida que el técnico reenvía por WhatsApp al agricultor.
// `lang` ('es'|'en') decide el idioma de todo el documento.

const PDFDocument = require('pdfkit');
const rotacion = require('./rotacion');
const ventana = require('./ventana');
const power = require('./power');
const { INFORME, grupoDe, tipoDe, langOk } = require('./i18n');

function _f(d, lang) { return d ? new Date(d).toLocaleDateString(langOk(lang) === 'es' ? 'es-BO' : 'en-US') : '—'; }
function _n(v, u) { return v == null ? '—' : v + (u || ''); }

function _titulo(doc, texto) {
	doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).fillColor('#1c1c1c').text(texto);
	doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#8fa68e').lineWidth(1).stroke();
	doc.moveDown(0.4).font('Helvetica').fontSize(10).fillColor('#333');
}

function _fila(doc, etiqueta, valor) {
	doc.font('Helvetica-Bold').text(etiqueta + ': ', { continued: true }).font('Helvetica').text(String(valor == null ? '—' : valor));
}

async function generar({ predio, parcela, solicitadoPor, lang }) {
	const L = langOk(lang);
	const T = INFORME[L];
	const f = (d) => _f(d, L);
	const centro = parcela && parcela.geometry && parcela.geometry.coordinates && parcela.geometry.coordinates[0] && parcela.geometry.coordinates[0][0]
		? { lon: parcela.geometry.coordinates[0][0][0], lat: parcela.geometry.coordinates[0][0][1] }
		: (predio.centro && predio.centro.coordinates ? { lon: predio.centro.coordinates[0], lat: predio.centro.coordinates[1] } : null);

	let clima = null, climaMeta = null;
	if (centro) {
		const [clim, dia] = await Promise.all([power.climatologia(centro.lat, centro.lon), power.diario(centro.lat, centro.lon, 120)]);
		climaMeta = power.resumen(dia, clim);
		const ven = ventana.evaluar({ clima: clim, resumenPower: climaMeta, especie: parcela ? parcela.especieActual : null, lang: L });

		const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 }, info: { Title: T.titulo + ' · ' + predio.nombre, Author: 'Field Shift' } });
		const chunks = [];
		doc.on('data', (c) => chunks.push(c));
		const fin = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

		doc.font('Helvetica-Bold').fontSize(20).fillColor('#1c1c1c').text(T.titulo);
		doc.font('Helvetica').fontSize(10).fillColor('#555').text(T.generado + f(new Date()) + (solicitadoPor ? T.para + solicitadoPor : ''));
		doc.moveDown(0.5);
		doc.fontSize(9).fillColor('#777').text(T.nota_clima);

		_titulo(doc, T.predio + predio.nombre);
		if (predio.descripcion) _fila(doc, T.descripcion, predio.descripcion);
		_fila(doc, T.parcelas_registradas, predio.parcelas.length);
		if (centro) _fila(doc, T.ubicacion, 'lat ' + centro.lat.toFixed(5) + ', lon ' + centro.lon.toFixed(5));

		if (climaMeta) {
			_titulo(doc, T.clima_h);
			_fila(doc, T.lluvia_anual, _n(climaMeta.lluviaAnualMedia, ' mm'));
			_fila(doc, T.lluvia_mes, _n(climaMeta.lluviaUltimoMes, ' mm'));
			_fila(doc, T.humedad_suelo, climaMeta.humedadSueloReciente != null ? climaMeta.humedadSueloReciente + ' (0–1)' : '—');
			if (climaMeta.anomaliaLluvia != null) _fila(doc, T.anomalia, climaMeta.anomaliaLluvia + ' %');
		}

		const parcelas = parcela ? [parcela] : predio.parcelas;
		for (const p of parcelas) {
			doc.addPage();
			_titulo(doc, tipoDe(p.tipo, L) + ': ' + p.nombre);
			_fila(doc, T.siembra_actual, p.especieActual || '—');
			if (p.fechaSiembraActual) _fila(doc, T.sembrado_el, f(p.fechaSiembraActual));

			const suelo = (p.suelos || []).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
			if (suelo) {
				_titulo(doc, T.ultimo_suelo(f(suelo.fecha), suelo.fuente || 'laboratorio'));
				_fila(doc, 'pH', _n(suelo.ph));
				_fila(doc, T.mo, _n(suelo.materiaOrganica, ' %'));
				_fila(doc, T.nitrogeno, _n(suelo.nitrogeno, ' %'));
				_fila(doc, T.textura, suelo.textura || '—');
			}

			if (p.historial && p.historial.length) {
				_titulo(doc, T.historial_h);
				p.historial.slice().sort((a, b) => new Date(b.inicio || 0) - new Date(a.inicio || 0)).slice(0, 8).forEach((s) => {
					doc.text('• ' + s.especie + '  (' + f(s.inicio) + ' → ' + (s.fin ? f(s.fin) : T.vigente) + ')' + (s.rendimiento ? ' · ' + s.rendimiento + ' ' + (s.rendimientoUnidad || 'kg MS/ha') : ''));
				});
			}

			if (p.aforos && p.aforos.length) {
				_titulo(doc, T.aforos_h);
				p.aforos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 5).forEach((a) => {
					doc.text('• ' + f(a.fecha) + ': ' + _n(a.kgMSHa, L === 'es' ? ' kg MS/ha' : ' kg DM/ha') + (a.metodo ? ' (' + a.metodo + ')' : ''));
				});
			}

			const r = await rotacion.recomendar({ parcela: p, clima: climaMeta, lang: L });
			_titulo(doc, T.rotacion_h(p.especieActual || T.siembra_vacia));
			r.recomendaciones.forEach((c, i) => {
				doc.font('Helvetica-Bold').text((i + 1) + '. ' + c.especie + '  (' + c.puntaje + '/100, ' + grupoDe(c.grupo, L) + ')');
				doc.font('Helvetica');
				c.razones.slice(0, 3).forEach((z) => doc.text('   – ' + z));
				if (c.notas) doc.text('   ' + c.notas, { oblique: true });
				doc.moveDown(0.2);
			});
		}

		if (ven && ven.ok) {
			doc.addPage();
			_titulo(doc, T.ventana_h);
			const v = { favorable_ahora: T.v_favorable, ventana_pero_seco: T.v_seco, esperar: T.v_esperar }[ven.veredicto] || ven.veredicto;
			_fila(doc, T.veredicto, v);
			_fila(doc, T.mes_actual, ven.estado.mes);
			ven.ventanas.forEach((w) => doc.text(T.ventana_item(w.desde, w.hasta, w.lluviaMinMes, w.lluviaMaxMes)));
			if (!ven.ventanas.length) doc.text(T.sin_ventana(ven.umbralLluviaMes));
			_titulo(doc, T.riesgos_h);
			ven.riesgos.forEach((r) => doc.text('• ' + r));
		}

		doc.moveDown(1);
		doc.fontSize(8).fillColor('#999').text(T.pie, { align: 'center' });
		doc.end();
		return fin;
	}

	// Sin coordenadas: informe mínimo igualmente útil.
	const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
	const chunks = [];
	doc.on('data', (c) => chunks.push(c));
	const fin = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
	doc.font('Helvetica-Bold').fontSize(20).text(T.titulo);
	doc.font('Helvetica').fontSize(10).text(T.predio + predio.nombre + ' · ' + T.parcelas_n(predio.parcelas.length));
	doc.text(T.sin_coords);
	doc.end();
	return fin;
}

module.exports = { generar };
