const key = process.env.PROSPECTING_GOOGLE_PLACES_KEY?.trim();
const embedKey = process.env.PROSPECTING_GOOGLE_MAPS_EMBED_KEY?.trim();
const fieldMask = ['id','displayName','formattedAddress','primaryTypeDisplayName','location'].map(field => `places.${field}`).join(',');
export const placesConfigured = Boolean(key);
export const mapsEmbedKey = embedKey && embedKey !== key ? embedKey : '';

function unavailable(message,status) { throw Object.assign(new Error(message),{status}); }
async function readJson(url,options) {
  const response = await fetch(url,{...options,signal:AbortSignal.timeout(9000),redirect:'error'}).catch(() => null);
  if (response?.status === 429) unavailable('A cota do Google Maps foi atingida.',429);
  if (response?.status === 403) unavailable('O Google Maps recusou a solicitação. Confira as APIs ativas, as restrições da chave e o faturamento.',502);
  if (!response?.ok) unavailable('O Google Maps não respondeu. Tente novamente.',502);
  return response.json();
}

function distance(center,other) {
  const rad = value => value*Math.PI/180;
  const dLat = rad(other.latitude-center.latitude), dLon = rad(other.longitude-center.longitude);
  const part = Math.sin(dLat/2)**2+Math.cos(rad(center.latitude))*Math.cos(rad(other.latitude))*Math.sin(dLon/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(part)));
}

export async function placesSearch(keywords,location,km) {
  if (!placesConfigured) unavailable('Configure a chave do Google Maps para buscar novas empresas.',503);
  const geo = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  geo.search = new URLSearchParams({address:location,key,language:'pt-BR'});
  const result = await readJson(geo);
  if (result.status === 'ZERO_RESULTS') return [];
  if (result.status === 'REQUEST_DENIED') unavailable('A Geocoding API recusou a solicitação. Confira a chave e o faturamento.',502);
  if (result.status === 'OVER_QUERY_LIMIT') unavailable('A cota da Geocoding API foi atingida.',429);
  const point = result.results?.[0]?.geometry?.location;
  if (result.status !== 'OK' || !point) unavailable('Não foi possível localizar essa região no Google Maps.',502);
  const center = {latitude:point.lat,longitude:point.lng};
  const radius = km*1000;
  const responses = await Promise.all(keywords.map(keyword => {
    const payload = {textQuery:`${keyword} em ${location}`,languageCode:'pt-BR',pageSize:20,locationBias:{circle:{center,radius}}};
    return readJson('https://places.googleapis.com/v1/places:searchText',{
      method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':fieldMask},body:JSON.stringify(payload)
    });
  }));
  return responses.flatMap(response => response.places || []).filter(place => place.id && place.displayName?.text && place.location && distance(center,place.location) <= radius).map(place => ({
    placeId:place.id, name:place.displayName.text, address:place.formattedAddress || '', category:place.primaryTypeDisplayName?.text || ''
  }));
}
