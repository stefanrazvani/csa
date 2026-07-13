// Corpul HTML trebuie încărcat înaintea shell-ului Blaze; fără acest import,
// ruta pornea înainte să existe elementul #app și rezultatul era o pagină albă.
import './main.html';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import { bootstrapGateway } from '/imports/system/gateway/client';
import '/imports/layout/client';
import '/imports/system/dashboard/client';
import '/imports/system/experience/client';
import '/imports/system/admin/client';
import '/imports/system/governance/client';
import '/imports/modules/index-client.js';

bootstrapGateway();
