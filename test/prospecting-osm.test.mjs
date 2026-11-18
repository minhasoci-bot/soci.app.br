import test from 'node:test';
import assert from 'node:assert/strict';
import { boundingBox, distanceKm, nicheTerms } from '../prospecting-osm.mjs';
import { runProspectingAction, hydrateProspecting } from '../prospecting-model.mjs';

test('Niche terms expand Portuguese keywords with OpenStreetMap-friendly synonyms', () => {
  assert.deepEqual(nicheTerms('Dentista'),['dentista','odonto','odontologia']);
  assert.ok(nicheTerms('academia').includes('fitness'));
  assert.deepEqual(nicheTerms('Loja da Ana'),['loja da ana']);
});

test('Bounding box and distance stay consistent with the selected radius', () => {
  const center = { lat:-19.9227,lon:-43.9451 };
  const box = boundingBox(center,5);
  assert.ok(Math.abs(distanceKm(center,{ lat:box.north,lon:center.lon })-5) < 0.05);
  assert.ok(Math.abs(distanceKm(center,{ lat:center.lat,lon:box.east })-5) < 0.05);
});

test('Saving OpenStreetMap results stores server-looked-up details and ignores unknown ids', () => {
  const agency = hydrateProspecting({ prospects:[],prospecting:{} });
  const place = { placeId:'osm-N123',name:'Alivare Odontologia',category:'Dentista',address:'Rua dos Guajajaras, 2003',city:'Belo Horizonte',
    region:'Minas Gerais',postal:'30180-101',phone:'+55 31 3333-3333',website:'alivare.com.br',email:'not-an-email' };
  const created = runProspectingAction(agency,{ op:'save-maps',data:{ placeIds:['osm-N123','osm-N999'] } },{ places:[place] });
  assert.equal(created.length,1);
  const [row] = agency.prospects;
  assert.equal(row.name,'Alivare Odontologia');
  assert.equal(row.source,'OSM');
  assert.equal(row.website,'https://alivare.com.br/');
  assert.equal(row.email,'');
  assert.equal(row.placeId,'osm-N123');
  assert.deepEqual(runProspectingAction(agency,{ op:'save-maps',data:{ placeIds:['osm-N123'] } },{ places:[place] }),[]);
});
