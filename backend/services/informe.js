// servicios/fieldShift/services/informe.js — informe PDF por predio.
//
// PDFKit, una página por predio más una por parcela con análisis:
// ficha, suelo (último PRIAS), siembra actual e historial, aforos,
// recomendación de rotación (top-3) y ventana de siembra forrajera.
// El PDF es la salida que el técnico reenvía por WhatsApp al agricultor.

const PDFDocument = require('pdfkit');
const rotacion = require('./rotacion');
const ventana = require('./ventana');
const power = require('./power');

const MESES = ventana.MESES;

function _f(d) { return d ? new Date(d).toLocaleDateString('es-BO') : '—'; }
function _n(v, u) { return v == null ? '—' : v + (u || ''); }

function _titulo(doc, texto) {
	doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).fillColor('#1c1c1c').text(texto);
	doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#8fa68e').lineWidth(1).stroke();
	doc.moveDown(0.4).font('Helvetica').fontSize(10).fillColor('#333');
}

function _fila(doc, etiqueta, valor) {
	doc.font('Helvetica-Bold').text(etiqueta + ': ', { continued: true }).font('Helvetica').text(String(valor == null ? '—' : valor));
}

async function generar({ predio, parcela, solicitadoPor }) {
	const centro = parcela && parcela.geometry && parcela.geometry.coordinates && parcela.geometry.coordinates[0] && parcela.geometry.coordinates[0][0]
		? { lon: parcela.geometry.coordinates[0][0][0], lat: parcela.geometry.coordinates[0][0][1] }
		: (predio.centro && predio.centro.coordinates ? { lon: predio.centro.coordinates[0], lat: predio.centro.coordinates[1] } : null);

	let clima = null, climaMeta = null;
	if (centro) {
		const [clim, dia] = await Promise.all([power.climatologia(centro.lat, centro.lon), power.diario(centro.lat, centro.lon, 120)]);
		climaMeta = power.resumen(dia, clim);
		const rec = await rotacion.recomendar({ parcela, clima: climaMeta });
		const ven = ventana.evaluar({ clima: clim, resumenPower: climaMeta, especie: parcela ? parcela.especieActual : null });

		const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 }, info: { Title: 'Informe ' + predio.nombre, Author: 'Field Shift' } });
		const chunks = [];
		doc.on('data', (c) => chunks.push(c));
		const fin = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

		doc.font('Helvetica-Bold').fontSize(20).fillColor('#1c1c1c').text('Field Shift — informe de predio');
		doc.font('Helvetica').fontSize(10).fillColor('#555').text('Generado el ' + _f(new Date()) + (solicitadoPor ? ' para ' + solicitadoPor : ''));
		doc.moveDown(0.5);
		doc.fontSize(9).fillColor('#777').text('Datos climáticos: NASA POWER (serie diaria y climatología multianual). Recomendaciones orientadas a pasturas y cultivos de servicio.');

		_titulo(doc, 'Predio: ' + predio.nombre);
		if (predio.descripcion) _fila(doc, 'Descripción', predio.descripcion);
		_fila(doc, 'Parcelas registradas', predio.parcelas.length);
		if (centro) _fila(doc, 'Ubicación', 'lat ' + centro.lat.toFixed(5) + ', lon ' + centro.lon.toFixed(5));

		if (climaMeta) {
			_titulo(doc, 'Clima del predio (NASA POWER)');
			_fila(doc, 'Lluvia anual media', _n(climaMeta.lluviaAnualMedia, ' mm'));
			_fila(doc, 'Lluvia último mes', _n(climaMeta.lluviaUltimoMes, ' mm'));
			_fila(doc, 'Humedad de suelo reciente (raíz)', climaMeta.humedadSueloReciente != null ? climaMeta.humedadSueloReciente + ' (0–1)' : '—');
			if (climaMeta.anomaliaLluvia != null) _fila(doc, 'Anomalía de lluvia del último mes', climaMeta.anomaliaLluvia + ' %');
		}

		const parcelas = parcela ? [parcela] : predio.parcelas;
		for (const p of parcelas) {
			doc.addPage();
			_titulo(doc, (p.tipo === 'potrero' ? 'Potrero' : 'Parcela') + ': ' + p.nombre);
			_fila(doc, 'Siembra actual', p.especieActual || '—');
			if (p.fechaSiembraActual) _fila(doc, 'Sembrado el', _f(p.fechaSiembraActual));

			const suelo = (p.suelos || []).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
			if (suelo) {
				_titulo(doc, 'Último análisis de suelo (' + _f(suelo.fecha) + ', ' + (suelo.fuente || 'laboratorio') + ')');
				_fila(doc, 'pH', _n(suelo.ph));
				_fila(doc, 'Materia orgánica', _n(suelo.materiaOrganica, ' %'));
				_fila(doc, 'Nitrógeno', _n(suelo.nitrogeno, ' %'));
				_fila(doc, 'Textura', suelo.textura || '—');
			}

			if (p.historial && p.historial.length) {
				_titulo(doc, 'Historial de siembras');
				p.historial.slice().sort((a, b) => new Date(b.inicio || 0) - new Date(a.inicio || 0)).slice(0, 8).forEach((s) => {
					doc.text('• ' + s.especie + '  (' + _f(s.inicio) + ' → ' + (s.fin ? _f(s.fin) : 'vigente') + ')' + (s.rendimiento ? ' · ' + s.rendimiento + ' kg MS/ha' : ''));
				});
			}

			if (p.aforos && p.aforos.length) {
				_titulo(doc, 'Aforos');
				p.aforos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 5).forEach((a) => {
					doc.text('• ' + _f(a.fecha) + ': ' + _n(a.kgMSHa, ' kg MS/ha') + (a.metodo ? ' (' + a.metodo + ')' : ''));
				});
			}

			const r = await rotacion.recomendar({ parcela: p, clima: climaMeta });
			_titulo(doc, 'Rotación sugerida tras ' + (p.especieActual || 'la siembra actual'));
			r.recomendaciones.forEach((c, i) => {
				doc.font('Helvetica-Bold').text((i + 1) + '. ' + c.especie + '  (' + c.puntaje + '/100, ' + (c.grupo || '') + ')');
				doc.font('Helvetica');
				c.razones.slice(0, 3).forEach((z) => doc.text('   – ' + z));
				if (c.notas) doc.text('   ' + c.notas, { oblique: true });
				doc.moveDown(0.2);
			});
		}

		if (ven && ven.ok) {
			doc.addPage();
			_titulo(doc, 'Ventana de siembra forrajera');
			const v = { favorable_ahora: 'Favorable ahora', ventana_pero_seco: 'En ventana, pero seco', esperar: 'Esperar' }[ven.veredicto] || ven.veredicto;
			_fila(doc, 'Veredicto', v);
			_fila(doc, 'Mes actual', ven.estado.mes);
			ven.ventanas.forEach((w) => doc.text('• Ventana: ' + w.desde + ' a ' + w.hasta + ' (' + w.lluviaMinMes + '–' + w.lluviaMaxMes + ' mm/mes)'));
			if (!ven.ventanas.length) doc.text('Sin meses por encima de ' + ven.umbralLluviaMes + ' mm/mes en la climatología del punto.');
			_titulo(doc, 'Riesgos');
			ven.riesgos.forEach((r) => doc.text('• ' + r));
		}

		doc.moveDown(1);
		doc.fontSize(8).fillColor('#999').text('Field Shift · PRIAS digital · Recomendaciones de apoyo a la decisión: contrastar siempre con el técnico de campo.', { align: 'center' });
		doc.end();
		return fin;
	}

	// Sin coordenadas: informe mínimo igualmente útil.
	const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
	const chunks = [];
	doc.on('data', (c) => chunks.push(c));
	const fin = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
	doc.font('Helvetica-Bold').fontSize(20).text('Field Shift — informe de predio');
	doc.font('Helvetica').fontSize(10).text('Predio: ' + predio.nombre + ' · ' + predio.parcelas.length + ' parcela(s)');
	doc.text('Sin coordenadas: agrega el polígono de al menos una parcela para incluir clima y análisis.');
	doc.end();
	return fin;
}

module.exports = { generar };
