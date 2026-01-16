
FROM node:20-alpine

#set working directory
WORKDIR /app

# Copy shared library into container (so npm can install it)
COPY shared ./shared

#build shared
WORKDIR /app/shared
RUN npm install
RUN npx tsc

#copy only dependency files first (better caching)
WORKDIR /app
COPY api/package*.json ./api/


#Install dependencies
WORKDIR /app/api
RUN npm install



#copy rest of the source code
# WORKDIR /app/api
COPY api/. ./

#build NestJs app
RUN npm run build

#Expose API port
EXPOSE 3001

#Run compiled app
CMD ["npm", "run", "start:prod"]



