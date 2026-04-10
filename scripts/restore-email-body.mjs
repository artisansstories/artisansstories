import { Client } from 'pg';

const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_xhPprv63KFdQ@ep-plain-mode-anryujyt.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require' });

const bodyContent = `<p style="font-size:17px;color:#4a3728;line-height:1.6;margin-bottom:20px;">Hi!</p>
<p style="font-size:17px;color:#4a3728;line-height:1.6;margin-bottom:24px;font-style:italic;">I am so happy you're here.</p>
<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">I'm Anna, the founder of Artisans' Stories. I started this business with a "random spark" and a big mission: to build a bridge between the deep roots of my home in El Salvador and the modern craft I create here in the United States.</p>
<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">Artisans' Stories is a collaboration. On one side of the bridge, you'll find master makers like Lilian, who hand-sews our cotton totes, and Gerardo, a third-generation leather artisan. On the other side, you'll find me in my studio in the US.</p>
<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:16px;">I don't just curate these pieces—I'm a maker, too. While I hand-select and "finish" many of our imported goods with custom laser engraving and sublimation, I also create my own original designs right here in the States.</p>
<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:24px;">These "Studio Originals" are the glue of our shop. They allow me to keep the creative energy flowing and the doors open while I travel back to El Salvador to find the next hidden story to share with you.</p>
<h3 style="font-size:16px;color:#4a3728;margin:24px 0 16px 0;font-weight:600;">By joining this list, you'll get:</h3>
<ul style="padding-left:20px;margin-bottom:28px;">
  <li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:12px;"><strong>The Stories:</strong> Meet the makers behind the heritage crafts.</li>
  <li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:12px;"><strong>The Studio Drops:</strong> Be the first to shop my original US-made designs.</li>
  <li style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-bottom:12px;"><strong>The Journey:</strong> I'm heading back to El Salvador in just a few days to visit Gerardo's workshop and I will be sharing that experience with you soon.</li>
</ul>
<p style="font-size:15px;color:#5a4a3a;line-height:1.75;margin-top:28px;">Thank you for believing that every product has a soul—whether it was born in a garage in a countryside town in El Salvador, or in my studio here at home in the US.</p>`;

const footerContent = `<p style="margin:0;font-size:13px;color:#6b7280;">&copy; 2026 Artisans' Stories &middot; El Salvador to the United States</p>
<p style="margin:8px 0 0 0;font-size:12px;color:#9ca3af;"><a href="https://artisansstories.com" style="color:#8b5e3c;text-decoration:none;">artisansstories.com</a></p>`;

await client.connect();
await client.query('UPDATE "EmailTemplate" SET "bodyContent" = $1, "footerContent" = $2 WHERE id = $3', [bodyContent, footerContent, 'welcome']);
console.log('✅ Email body and footer restored');
await client.end();
